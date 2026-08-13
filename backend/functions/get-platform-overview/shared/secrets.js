const { SecretsManagerClient, GetSecretValueCommand, CreateSecretCommand, PutSecretValueCommand, DeleteSecretCommand }
  = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({});

async function getSecret(name) {
  const res = await client.send(new GetSecretValueCommand({ SecretId: name }));
  return res.SecretString;
}

async function storeSecret(name, value) {
  try {
    await client.send(new CreateSecretCommand({ Name: name, SecretString: value }));
  } catch (err) {
    if (err.name === 'ResourceExistsException') {
      await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: value }));
    } else {
      throw err;
    }
  }
  return name; // this becomes the *_ref value stored in Supabase
}

// Standard delete (default recovery window), not force-delete — this runs
// against real production secrets, not disposable test data, so it keeps
// AWS's built-in recovery window as a safety net against a mistaken call.
async function deleteSecret(name) {
  try {
    await client.send(new DeleteSecretCommand({ SecretId: name }));
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }
}

module.exports = { getSecret, storeSecret, deleteSecret };