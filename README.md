# Solana Trading API
A high-performance Node.js REST API for Solana blockchain operations including wallet management, token swapping, and DeFi automation.

## Features

### 🔐 Authentication & Security
- Token-based authentication with SQLite storage
- Hardware ID (HWID) binding for enhanced security
- Admin token management system (insecure, please don't use) (remove on your code)

### 💼 Wallet Operations
- **Create Wallets**: Generate new Solana wallets with BIP39 mnemonics
- **Import Wallets**: Restore wallets from existing seed phrases
- **Balance Checking**: Retrieve SOL and SPL token balances
- **SOL Transfers**: Send SOL between addresses with retry logic

### 🔄 Trading & DeFi
- **Token Swapping**: Powered by Jupiter DEX
- **Associated Token Accounts**: Automatic ATA creation and management
- **Bulk Operations**: Convert all tokens to SOL in one transaction
- **Quote Fetching**: Get real-time swap quotes before execution

### ⚡ Advanced Features
- **Transaction Retry Logic**: Automatic retry with fresh blockhashes (could keep failing tho)
- **Priority Fee Support**: Custom transaction fee configuration
- **Versioned Transactions**: Optimized for efficiency (yes efficacent oil)
- **Comprehensive Error Handling**: Logging and error responses

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd solana-trading-api

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

## Required Dependencies

```json
{
  "@solana/web3.js": "^1.87.6",
  "@solana/spl-token": "^0.3.8",
  "@project-serum/anchor": "^0.25.0",
  "@jup-ag/api": "^6.0.0",
  "express": "^4.18.2",
  "sqlite3": "^5.1.6",
  "bip39": "^3.1.0",
  "ed25519-hd-key": "^1.3.0",
  "axios": "^1.6.0"
}
```

## Configuration

### Environment Variables

Create a `.env` file with the following:

```env
# Solana RPC Configuration
SOLANA_RPC_URL=https://your-rpc-endpoint.com
SOLANA_WS_URL=wss://your-websocket-endpoint.com

# Token Program IDs (Mainnet defaults)
TOKEN_PROGRAM_ID=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
ASSOCIATED_TOKEN_PROGRAM_ID=ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL

# Admin Configuration
ADMIN_PASSWORD=your-secure-admin-password

# Server Configuration
PORT=3000
```

### Database Setup

The application automatically creates a SQLite database (`tokens.db`) on first run with the following schema:

```sql
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  hwid TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Authentication

All endpoints (except admin routes) require:
- `Authorization` header with valid token
- `hwid` header with hardware identifier

### Admin Routes

#### Generate Token
```http
POST /admin/generate-token
Content-Type: application/json

{
  "adminPassword": "your-admin-password"
}
```

#### List All Tokens
```http
GET /admin/tokens?adminPassword=your-admin-password
```

#### Delete Token
```http
DELETE /admin/token/:token
Content-Type: application/json

{
  "adminPassword": "your-admin-password"
}
```

### Wallet Operations

#### Create New Wallet
```http
GET /create-wallet
Authorization: your-token
hwid: your-hardware-id
```

Response:
```json
{
  "status": "success",
  "data": {
    "publicKey": "wallet-public-key",
    "mnemonic": "twelve word seed phrase",
    "privateKey": "base64-encoded-private-key"
  }
}
```

#### Import Wallet
```http
POST /login
Authorization: your-token
hwid: your-hardware-id
Content-Type: application/json

{
  "mnemonic": "your twelve word seed phrase"
}
```

#### Check Balance
```http
GET /balance/:address
```

### Trading Operations

#### Get Quote
```http
GET /quote?inputMint=SOL_MINT&outputMint=TOKEN_MINT&amount=1000000
```

#### Execute Swap
```http
POST /swap
Authorization: your-token
hwid: your-hardware-id
Content-Type: application/json

{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "target-token-mint",
  "amount": "1000000",
  "privateKey": "base64-private-key",
  "slippage": 50,
  "prioritizationFeeLamports": 1000
}
```

#### Dump All Tokens to SOL
```http
POST /dumpAllTokensToSol
Authorization: your-token
hwid: your-hardware-id
Content-Type: application/json

{
  "privateKey": "base64-private-key",
  "slippageBps": 50
}
```

#### Transfer SOL
```http
POST /transfer-sol
Authorization: your-token
hwid: your-hardware-id
Content-Type: application/json

{
  "privateKey": "base64-private-key",
  "recipientAddress": "recipient-public-key",
  "amount": 1.5,
  "priorityFee": 1000
}
```

### Development Routes

#### Request Airdrop (Devnet/Testnet)
```http
POST /request-airdrop
Authorization: your-token
hwid: your-hardware-id
Content-Type: application/json

{
  "address": "wallet-public-key"
}
```

## Usage Example

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Authorization': 'your-auth-token',
    'hwid': 'your-hardware-id',
    'Content-Type': 'application/json'
  }
});

// Create a new wallet
const wallet = await api.get('/create-wallet');

// Get SOL balance
const balance = await api.get(`/balance/${wallet.data.data.publicKey}`);

// Execute a swap
const swap = await api.post('/swap', {
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'target-token-mint',
  amount: '1000000',
  privateKey: wallet.data.data.privateKey,
  slippage: 50
});
```

## Security Considerations

⚠️ **IMPORTANT SECURITY NOTES:**

1. **Private Key Handling**: This API handles private keys in memory. Ensure secure deployment and consider implementing key encryption at rest.
2. **Logging**: The current implementation logs all request bodies. **Disable verbose logging in production** to prevent private key exposure.
3. **Admin Password**: Change the default admin password before deployment.
4. **HTTPS**: Always use HTTPS in production to encrypt API communications.
5. **Network Security**: Restrict API access to authorized networks/IPs.
6. **Database Security**: Secure the SQLite database file with appropriate file permissions.

## Performance Optimizations

- **Connection Pooling**: Uses persistent RPC connections with WebSocket support
- **Transaction Retry Logic**: Automatic retry mechanism for failed transactions
- **Versioned Transactions**: Optimized transaction format for lower fees
- **Async Operations**: Non-blocking operations throughout the API

## Error Handling

The API provides comprehensive error handling with detailed response messages:

```json
{
  "status": "error",
  "message": "Detailed error description",
  "details": "Additional error context (in debug mode)"
}
```

## Development

```bash
# Start the server
npm start

# Development mode with auto-reload
npm run dev

# Run tests
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

[MIT License](LICENSE)

## Disclaimer

This software is provided "as is" without warranty. Use at your own risk. The authors are not responsible for any financial losses incurred through the use of this API. 
PLEASE LANG GAMITIN NYO TESTNET, GINAMIT KO LIVE :(

## Support

For issues and questions:
- Open an issue on GitHub
- Check the documentation
- Review the code comments for implementation details
