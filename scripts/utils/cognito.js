const AWS = require("aws-sdk");
const esmImport = require("esm")(module);

// AWS export was generated with ES import / export syntax
// We use esm to bridge that gap
const awsExports = esmImport("../../src/aws-exports").default;

if (!process.env.AWS_PROFILE) {
  throw new Error("Must set AWS_PROFILE first.");
}

const config = {
  authFlow: "ADMIN_NO_SRP_AUTH",
  defaultPassword: process.env.TEMP_PASSWORD || "Password1!",
  profile: process.env.AWS_PROFILE,
  tmpPassword: "TempPassword123!",
};

const credentials = new AWS.SharedIniFileCredentials({ profile: config.profile });

AWS.config.credentials = credentials;
AWS.config.update({ region: awsExports.aws_project_region });

const cognitoIdp = new AWS.CognitoIdentityServiceProvider();

function callCognito(func, params) {
  return new Promise((resolve, reject) => {
    cognitoIdp[func]({ UserPoolId: awsExports.aws_user_pools_id, ...params }, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

function listUserPoolClients() {
  const params = {
    MaxResults: 60, // max
  };

  return callCognito("listUserPoolClients", params);
}

function createUserPoolClient() {
  const params = {
    ClientName: `${awsExports.aws_user_pools_id}-seeder`,
    GenerateSecret: false,
    ExplicitAuthFlows: [config.authFlow],
  };

  return callCognito("createUserPoolClient", params);
}

async function createAppClient() {
  let clientId;
  const pools = await listUserPoolClients();
  const pool = pools.UserPoolClients.find(p => p.ClientName === `${awsExports.aws_user_pools_id}-seeder`);

  if (pool) {
    return pool.ClientId;
  }

  try {
    const appClient = await createUserPoolClient();
    clientId = appClient.UserPoolClient.ClientId;
  } catch (e) {
    throw e;
  }

  return clientId;
}

function createUser(userName, email, phoneNumber) {
  const params = {
    Username: userName,
    TemporaryPassword: config.tmpPassword,
    UserAttributes: [
      {
        Name: "phone_number",
        Value: phoneNumber,
      },
      {
        Name: "email",
        Value: email,
      },
      {
        Name: "email_verified",
        Value: "True",
      },
      {
        Name: "phone_number_verified",
        Value: "True",
      },
    ],
  };

  return callCognito("adminCreateUser", params);
}

function deleteUser(userName) {
  const params = {
    Username: userName,
  };

  return callCognito("adminDeleteUser", params);
}

function initiateAuth(clientId, username) {
  const params = {
    ClientId: clientId,
    AuthFlow: config.authFlow,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: config.tmpPassword,
    },
  };

  return callCognito("adminInitiateAuth", params);
}

function respondToAuthChallenge(clientId, username, token) {
  const params = {
    ClientId: clientId,
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ChallengeResponses: {
      USERNAME: username,
      NEW_PASSWORD: config.defaultPassword,
    },
    Session: token,
  };

  return callCognito("adminRespondToAuthChallenge", params);
}

async function createUsers(users) {
  try {
    const clientId = await createAppClient();
    users.forEach(async u => {
      await createUser(u.userName, u.email, u.phoneNumber);
      const { Session } = await initiateAuth(clientId, u.userName);
      await respondToAuthChallenge(clientId, u.userName, Session);
      console.log("User creation succeeded:", JSON.stringify(u, null, 2));
    });
  } catch (e) {
    console.error(e);
    throw new Error("Unable to create user");
  }
};

async function deleteUsers(users) {
  try {
    users.forEach(async u => {
      await deleteUser(u.userName);
      console.log("User deletion succeeded:", JSON.stringify(u, null, 2));
    });
  } catch (e) {
    console.error(e);
    throw new Error("Error while truncating users");
  }
}

module.exports = {
  createUsers,
  deleteUsers,
};
