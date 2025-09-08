// client.js
const axios = require('axios');
const si = require('systeminformation'); // npm install systeminformation

const API_URL = 'http://0.0.0.0:3000'; // Adjust if necessary

async function getDiskSerial() {
  try {
    const disks = await si.diskLayout();
    if (disks && disks.length > 0) {
      return disks[0].serialNum || disks[0].serial;
    }
    throw new Error("No disks found");
  } catch (error) {
    console.error("Error fetching disk serial:", error);
    throw error;
  }
}

async function main() {
  try {
    // 1. Get the HWID from the first disk's serial number.
    const hwid = await getDiskSerial();
    console.log("Disk Serial Number (HWID):", hwid);

    // 2. Generate a token for this HWID (admin endpoint).
    const adminPassword = "changeThisPasswordToWhateverYouWant";
    console.log("\nGenerating token for HWID...");
    const genTokenRes = await axios.post(`${API_URL}/admin/generate-token`, {
      adminPassword,
      hwid
    });
    const token = '';
    console.log("Generated token:", token);

    // Set default headers for subsequent requests.
    axios.defaults.headers.common['authorization'] = token;
    axios.defaults.headers.common['hwid'] = hwid;

    // 3. Create a new wallet.
    console.log("\nCreating a new wallet...");
    const createWalletRes = await axios.get(`${API_URL}/create-wallet`);
    const { publicKey, mnemonic, privateKey } = createWalletRes.data.data;
    console.log("New wallet created:");
    console.log("  Public Key:", publicKey);
    console.log("  Mnemonic:", mnemonic);
    console.log("  Private Key (base64):", privateKey);

    // 4. Login using the mnemonic (protected by token + HWID).
    console.log("\nLogging in with mnemonic...");
    console.log(`hwid: ${hwid}"`);
    const loginRes = await axios.post(`${API_URL}/login`, { mnemonic, hwid });
    const loginData = loginRes.data.data;
    console.log("Login successful. Derived wallet info:");
    console.log("  Public Key:", loginData.publicKey);
    console.log("  Private Key (base64):", loginData.privateKey);

    // 5. Fetch wallet balance.
    console.log(`\nFetching balance for public key: ${loginData.publicKey}`);
    const balanceRes = await axios.get(`${API_URL}/balance/${loginData.publicKey}`);
    console.log("Balance info:", balanceRes.data.data);

    // 6. List all tokens (admin endpoint).
    console.log("\nFetching all tokens (admin endpoint)...");
    const tokensRes = await axios.get(`${API_URL}/admin/tokens`, { params: { adminPassword } });
    console.log("All tokens:", tokensRes.data.data.tokens);

    // 7. Delete the generated token (cleanup/demo).
    //console.log("\nDeleting token:", token);
    //const deleteRes = await axios.delete(`${API_URL}/admin/token/${token}`, { data: { adminPassword } });
    //console.log("Token deletion response:", deleteRes.data);

  } catch (error) {
    if (error.response) {
      console.error("Error response:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }
  }
}

main();