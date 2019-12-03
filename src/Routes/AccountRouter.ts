import express from "express";
import graphqlHTTP from "express-graphql";
import AccountModel from "../models/Account";
import { importSchema } from "graphql-import";
import { makeExecutableSchema } from "graphql-tools";
import { envConfig } from "../config";
import { parse } from "cookie";
import jwt from "jsonwebtoken";

var typeDefs = importSchema("./src/graphql/schema.graphql");

const updateTypes = ["username", "email", "password"];

interface IContext {
  response: express.Response;
  request: express.Request;
}
interface IAccountArgs {
  email: string;
  username: string;
  password: string;
}
interface ILoginArgs {
  getLogin(): any;
  email?: string;
  username?: string;
  password: string;
}
interface IUpdateArgs {
  key: string;
  newValue: string;
  oldValue?: string;
}
interface IFollowArgs{
  username:String;
}
interface ISearchUserArgs{
  username:String;
}
interface Imessage {
  account?:{
    username:string;
    email:string;
  }
  token?: string;
  message?: string;
  followed?:boolean;
  unfollowed?:boolean;
  created?: boolean;
  loggedIn?: boolean;
  status?: boolean;
  updated?:boolean;

}
interface loginConfig {
  [key: string]: any;
  [Symbol.iterator]: any;
}
interface ILoggedInuser {
    _id?:string | null
}
function sign(payload: object): Promise<string | undefined> {
  return new Promise((resove, reject) => {
    jwt.sign(
      payload,
      envConfig.privateKey,
      { expiresIn: "2h" },
      (error, token) => {
        if (error) {
          reject(error);
        } else {
          resove(token);
        }
      }
    );
  });
}
//predicate function to check if user is logged in has side effect of setting the user id to its context
function verifyPermision(this:ILoggedInuser, context: IContext): Promise<boolean> {
    var {request:{headers:{authorization, cookie}}} = context;
    var token:string | undefined;
    if(cookie != undefined){
      token = parse(cookie).token;
    }else if( authorization != undefined){
      token = authorization;
    }else{
      token = undefined;
    }
    if(token != undefined){
        return new Promise((resolve) => {
            jwt.verify(token as string, envConfig.privateKey, (error, decoded:any) => {
                if(error){
                    resolve(false);
                }else{
                    if(decoded._id){
                        this._id = decoded._id;
                        resolve(true);
                    }else{
                        resolve(false)
                    }
                }
            })
            
        })
    } else{
        return Promise.resolve(false);
    }

}
function parseMongooseError(error:any){
  if(typeof error == "object"){
    if(error.name == "MongoError"){
      switch(error.code){
        case 11000:
          return `${error.errmsg.split('"')[1]} already taken`;
        default:
          return error.errmsg;
      }
    }else{
      return String(error)
    }
  }else{
    return error
  }
}
var root = {
  async register(args: IAccountArgs): Promise<Imessage> {
    var message: Imessage = {};
    try {
      let { username, email, password: hash } = args;
      let account = { username, email, hash };
      await AccountModel.create(account);
      message = { message: `Account has been Created`, created: true };
    } catch (error) {
      message = { message:parseMongooseError(error), created: false };
    } finally {
      return message;
    }
  },
  async login(args: ILoginArgs, context: IContext): Promise<Imessage> {
    var message: Imessage = {};
    try {
      //user can log in with either username or email
      let _config: loginConfig = {
        *[Symbol.iterator]() {
          yield this.email;
          yield this.username;
        },
        getLogin() {
          //iterate through email and username and return its [key]:value based on what is not undefined and not and empty string
          for (let value of this) {
            if (value != undefined && value.trim().length > 0) {
              let key = Object.keys(this).find(key => this[key] == value);
              return {
                [key as string]: value,
                password: this.password,
                type: key
              };
            }
          }
          //if they are both undefined
          return undefined;
        }
      };
      Object.assign(args, _config);
      // Example: {email:"example@example.com", password:"Password1234", type:"email"}
      let $ = args.getLogin();

      if ($ != undefined) {
        let account = await AccountModel.findOne({ [$.type]: $[$.type] });
        if (account != undefined) {
          let valid = account.compareHash($.password);
          if (valid) {
            let token = await sign({ _id: account._id });
            if (token) {
              context.response.cookie("token", token);
              message = { token, loggedIn: true };
            } else {
              throw "Error logging in.";
            }
          } else {
            throw `Invalid ${$.type}/password`;
          }
        } else {
          throw `Invalid ${$.type}/password`;
        }
      } else {
        throw "Malformed body needs either email/username";
      }
    } catch (error) {
      message = { message:parseMongooseError(error), loggedIn: false };
    } finally {
      return message;
    }
  },
  async update(args: IUpdateArgs, context: IContext): Promise<Imessage> {
    var message:Imessage = {};
    var {key, oldValue, newValue} = args;
    var user = {_id:null};
    if(cantUpdate(key)) throw `You cannot update ${key}`;
    
    try{
      let loggedIn = await verifyPermision.call(user, context);
      let account:any = await AccountModel.findById(user._id);
      if (account[key] == newValue){
        throw `${key} is already ${newValue}`;
      }
      if(loggedIn && user._id != undefined){
        //set up the update object
        let update = {};
        switch(key){
          case "password":
              if(newValue == oldValue) throw "old password is the same as new password";
              if(oldValue == undefined) throw "Updating password requires you to add a oldValue:value key/pair";

            //compare current hash with newValue
            let valid = await account.compareHash(oldValue);
            if(valid){
               update = {hash:newValue};
            }else{
              throw "Old password is incorrect";
            }
            break;
          default:
            //email username and eveything else that can be updated without extra function calls;
            update = {[key]:newValue};
            break;
        }
        let updated;
        if(key.toLowerCase() != "password"){
          updated = await AccountModel.updateOne({_id:user._id}, update, {runValidators:true});
        }else{
          //no point in running validators here since we are doing it in the models pre updateOne middleware
          updated = await AccountModel.updateOne({_id:user._id}, update);
        }
       
        if (updated.nModified){
          message = {message:`${key} has been updated`, updated:true};
        }else{
          throw `could not update ${key}`;
        }
      }else{
        throw "Please log in.";
      }
    }catch(error){
      message = {message:parseMongooseError(error), updated:false};
    }finally{
      return message;
    }
    
    function cantUpdate(key:string):boolean{
      return !updateTypes.includes(key);
    }
   
  },
  async myAccount(_:void, context:IContext): Promise<Imessage>{
    var message:Imessage = {};
    var user = {_id:null};
    try{
      let loggedIn = await verifyPermision.call(user, context);
      if(loggedIn && user._id != undefined){
        let account:any = await AccountModel.findById(user._id);
        let {username, email} = account
        message = {message:"Account details", account:{username, email}, status:true};
      }else{ 
        throw "Please log in";
      }
    }catch(error){
      message = {message:parseMongooseError(error), status:false}
    }finally{
      return message
    }
  },
  async follow(args:IFollowArgs, context:IContext): Promise<Imessage>{
    var message:Imessage = {};
    var user = {_id:null};
    try{
      let {username} = args;
      let loggedIn = await verifyPermision.call(user, context);
      if(loggedIn && user._id != undefined){
        let currentAccount = await AccountModel.findById(user._id);
        if(currentAccount != undefined){

          if(currentAccount.username == username){
            throw "you cant follow yourself";
          }

          let accountToFollow = await AccountModel.findOne({username});

          if(accountToFollow == undefined){
            throw `user ${username} does not exist`;
          }
          //if you are following 
          if(accountToFollow.followers.includes(currentAccount._id) && currentAccount.following.includes(accountToFollow._id)){
            console.log(currentAccount.following);
            throw `you are already following ${username}`;
            //if you are not following 
          }else if(!accountToFollow.followers.includes(currentAccount._id) && !currentAccount.following.includes(accountToFollow._id)){
             //add to accountToFollow's follower array 
             let followed = await AccountModel.updateOne(accountToFollow, {$push:{followers:{_id:currentAccount._id}}});
             //add to currentAccount following array
             let following = await AccountModel.updateOne(currentAccount, {$push:{following:{_id:accountToFollow._id}}});
             if(followed.nModified && following.nModified){
                 message = {message:`you have followed ${accountToFollow.username}`, followed:true};
             }else{
               throw `Error unable to follow ${username}`;
             }
          }else{
           throw `Error unable to follow ${username}`;
          }

        }else{ 
          throw "Please Log in"
        }
      }
    }catch(error){
      console.log(error);
      message = {message:parseMongooseError(error), followed:false}
    }finally{
      return message;
    }
  },
  async unfollow(args:IFollowArgs, context:IContext): Promise<Imessage>{
    var message:Imessage = {};
    var user = {_id:null};
    try{
      let {username} = args;
      let loggedIn = await verifyPermision.call(user, context);
      if(loggedIn && user._id != undefined){
        let currentAccount = await AccountModel.findById(user._id);
        if(currentAccount != undefined){

          if(currentAccount.username == username){
            throw "you cant unfollow yourself";
          }

          let accountToUnfollow = await AccountModel.findOne({username});

          if(accountToUnfollow == undefined){
            throw `user ${username} does not exist`;
          }
          //if you are not following 
          if(!accountToUnfollow.followers.includes(currentAccount._id) && !currentAccount.following.includes(accountToUnfollow._id)){
            throw `you are not following ${username}`;
            //if you are following 
          }else if(accountToUnfollow.followers.includes(currentAccount._id) && currentAccount.following.includes(accountToUnfollow._id)){

              //remove accountToUnfollow from currentAccount following array
             let unfollowing = await AccountModel.updateOne(currentAccount, {$pullAll:{following:[accountToUnfollow._id]}}, {new:true});

              //remove currentAccount from accountToUnFollow's follower array 
             let unfollowed = await AccountModel.updateOne(accountToUnfollow, {$pullAll:{followers:[currentAccount._id]}}, {new:true});

             if(unfollowed.nModified && unfollowing.nModified){
                 message = {message:`you have unfollowed ${accountToUnfollow.username}`, unfollowed:true};
             }else{
               throw `Error unable to unfollow ${username}`;
             }
          }else{
           throw `Error unable to unfollow ${username}`;
          }

        }else{ 
          throw "Please Log in"
        }
      }
    }catch(error){
      message = {message:parseMongooseError(error), unfollowed:false}
    }finally{
      return message;
    }
  },
  async searchAccount(args:ISearchUserArgs):Promise<Array<any>>{
    var message:Array<any> = []
    try{
        let {username:search} = args;
        let filter = {username:new RegExp(search as string)};
        let searchResult = await AccountModel.find(filter).limit(30);
        message = 
        searchResult.map(user => { 
            return {
                followers:user.followers.length,
                following:user.following.length,
                username:user.username,
            }
        });
    }catch{
        //if any errors are thrown via mongoose
        return [];
    }finally{
        return message
    }   
},
}

var schema = makeExecutableSchema({
  typeDefs,
  resolverValidationOptions: {
    requireResolversForResolveType: false
  }
});

var AccountRouter = express.Router();

AccountRouter.use("/accounts", function controller(request, response) {
  return graphqlHTTP({
    schema,
    rootValue: root,
    graphiql: true,
    context: { request, response }
  })(request, response);
});

export default AccountRouter;
