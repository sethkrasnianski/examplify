const { createUsers } = require("./utils/cognito");

const users = [
  {
    userName: "seth@mojotech.com",
    email: "seth@mojotech.com",
    phoneNumber: "+15555555555",
  }
]

createUsers(users);
