import * as email_addresses from "../../../data/seed_data/email.json";
import * as usernames from "../../../data/seed_data/username.json";

interface ITestAccount{
    username:string | config;
    email:string | config;
    hash?:string;
    password?:string | config; 
}
interface config{
    type:string;
    suffix?:string;
    prefix?:string;
}

function generateUsername(type:string, prefix?:string, suffix?:string ):string{
    var username:string = "";
    var length = usernames.data.length;
    var base = usernames.data[Math.floor(Math.random() * length)].username;
    
    switch(type){
        case "good":
            username = base
            
        case "bad":
            username = (prefix || "") + base + (suffix || "");
    }
    return username
}

function genrateEmail(type:string, prefix?:string, suffix?:string ):string{
    var email:string = "";
    var length = email_addresses.data.length;
    var base = email_addresses.data[Math.floor(Math.random() * length)].email;
    
    switch(type){
        case "good":
            email = base
            break;
        case "bad":
            //left side of the valid email
            email = (prefix || "") + base.split("@")[0] + (suffix || "");
            break;
        
    }
    return email;
}

function generatePassword(type:string, prefix?:string, suffix?:string ):string{
    var password:string = ""
    var special = ["!","@","#","$","%","^","&","*","(",")"];
    var count = 0;
    var ascii = [..._a_z_0_9_special()];
    switch(type){
        case "good":
            (() => {
                for(let i = 0; i <= 32; ++i){
                    password += ascii[Math.floor(Math.random() * ascii.length)];
                }   
            })() 
            break;
        case "bad":
            password =  (prefix || "") + "password" + (suffix || "");  
    }
    
    function* _a_z_0_9_special(){
        for(let i = 97; i <= 122; ++i){
            yield count;
            yield special[count];
            yield String.fromCharCode(i);
            yield String.fromCharCode(i).toUpperCase();
            count ++;
            if (count == 10){
                count = 0;
            }
        }
    } 
    return password;
}


function testAccount(user:ITestAccount):ITestAccount{
    var handler = {
        set(obj:ITestAccount, prop:keyof ITestAccount, value:config){
            if (prop == "password"){
                delete obj.password;
                switch(value.type){
                    case "good":
                        if(value.suffix != undefined || value.prefix != undefined){
                            console.log(`you cant have a type:'${value.type}' and add a prefix or suffix to password`)
                            return Reflect.set(obj, "password", "");
                        }else{
                            return Reflect.set(obj, "hash", generatePassword("good"));
                        }
                        
                    case "bad":
                        return Reflect.set(obj, "hash", generatePassword("bad", (value.prefix || ""), (value.suffix || "")));
                    default:
                        console.log(`not a valid type:'${value.type}' for password use good | bad`);
                        return Reflect.set(obj, "password", "");
                }
            }else if(prop == "email"){
                switch(value.type){
                    case "good":
                        if(value.suffix != undefined || value.prefix != undefined){
                            console.log(`you cant have a type:'${value.type}' and add a prefix or suffix to email`)
                            return Reflect.set(obj, "email", obj.email);
                        }else{
                            return Reflect.set(obj, "email", genrateEmail("good"));
                        }
                    case "bad":
                        return Reflect.set(obj, "email", genrateEmail("bad", (value.prefix || ""), (value.suffix || "")));
                    default:
                        console.log(`not a valid type:'${value.type}' for email use good | bad`);
                        return Reflect.set(obj, "email", obj.email);
                }
            
            }else if (prop == "username"){
                switch(value.type){
                    case "good":
                        if(value.suffix != undefined || value.prefix != undefined){
                            console.log(`you cant have a type:'${value.type}' and add a prefix or suffix to username`)
                            return Reflect.set(obj, "username", obj.username);
                        }else{
                            return Reflect.set(obj, "username", generateUsername("good"));
                        }
                       
                    case "bad":
                        return Reflect.set(obj, "username", generateUsername("bad", (value.prefix || ""), (value.suffix || "")));
                    default:
                            console.log(`not a valid type:'${value.type}' for username use good | bad`);
                            return Reflect.set(obj, "email", obj.email);
            }
            }else{
                return false;
            }
        }
    }
    return new Proxy(user, handler)
}

export default testAccount