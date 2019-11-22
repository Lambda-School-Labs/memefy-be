const PORT = process.env.PORT || 5000;
import express from "express";
import AccountRouter from "./Routes/AccountRouter";

var app = express();
app.use("/",AccountRouter);
app.listen(PORT, () => {
    console.log(`server up and running *:${PORT}`);
})