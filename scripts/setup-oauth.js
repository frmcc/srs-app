const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config({ path: '.env' });

// Replace these with the actual Client ID and Secret from your Google Cloud Console
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "PASTE_CLIENT_ID_HERE";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "PASTE_CLIENT_SECRET_HERE";
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Legacy out-of-band flow or use 'http://localhost:3000'

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function getAccessToken() {
  if (CLIENT_ID === "PASTE_CLIENT_ID_HERE") {
    console.log("\n❌ Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file first!\n");
    return;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forces Google to give us a refresh token
  });

  console.log('========================================================================');
  console.log('1. Go to this URL in your browser:');
  console.log('\n', authUrl, '\n');
  console.log('2. Log in with your personal Google Account (FrankMcCarthy25@gmail.com)');
  console.log('3. Allow the permissions');
  console.log('4. Copy the code provided and paste it below');
  console.log('========================================================================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oauth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('❌ Error retrieving access token:', err);
        return;
      }
      console.log('\n✅ SUCCESS! Here is your Refresh Token:\n');
      console.log('GOOGLE_REFRESH_TOKEN=' + token.refresh_token);
      console.log('\n👉 Copy and paste the line above into your .env file!');
    });
  });
}

getAccessToken();
