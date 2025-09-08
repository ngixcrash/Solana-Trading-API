
////
/*

DO NOT COMPLAIN,
JUST LOOK.

IK
*/
////

const express = require('express');
const {
    Connection,
    PublicKey,
    Keypair,
    LAMPORTS_PER_SOL,
    Transaction,
    SystemProgram,
    VersionedMessage,
    VersionedTransaction,
    TransactionInstruction,
    sendAndConfirmRawTransaction,
    sendAndConfirmTransaction,
    TransactionExpiredBlockheightExceededError,
    TransactionMessage

} = require('@solana/web3.js');
const {
    Token,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const { Wallet } = require('@project-serum/anchor');
const bip39 = require('bip39');
const ed25519 = require('ed25519-hd-key');
const axios = require('axios');
const { createJupiterApiClient } = require('@jup-ag/api');
const app = express();

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const db = new sqlite3.Database('tokens.db');


db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      hwid TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

app.use(express.json());


//DONT USE THIS FOR REAL-LIFE OPERATIONS
//THIS WILL LOG YOUR PASSPHRASE/KEYS/ETC
app.use((req, res, next) => {
    const clientIp = req.ip;
    const logEntry = `[${new Date().toISOString()}] Client IP: ${clientIp}, Method: ${req.method}, URL: ${req.url}, Body: ${JSON.stringify(req.body)}\n`;
    console.log(logEntry);
    next();
});

const SOL_MINT = 'So11111111111111111111111111111111111111112';


const connection = new Connection(
    'NODE_HERE',
    {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000, // 60 seconds
        wsEndpoint: 'wss://NODE_HERE'
    }
);

//USE JUPITER TOKEN FOR SWAPPING
const jupiterQuoteApi = createJupiterApiClient({
    basePath: 'https://quote-api.jup.ag/v6',
});

//CHANGE THIS TO YOUR OWN VALUES
const TOKEN_PROGRAM_ID = new PublicKey(process.env.TOKEN_PROGRAM_ID);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(process.env.ASSOCIATED_TOKEN_PROGRAM_ID);




//AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH
//==========================================================================
function generateToken() {return crypto.randomBytes(25).toString('hex'); }
function authbitch(req, res, next) {
    const token = req.headers['authorization'];
    const reqHwid = req.headers['hwid'];
    if (!token) {
      return res.status(401).json({ status: 'auth-error', message: 'Missing token.' });
    }
    if (!reqHwid) {
      return res.status(401).json({ status: 'auth-error', message: 'Missing HWID.' });
    }
  
    db.get('SELECT * FROM tokens WHERE token = ?', [token], (err, row) => {
      if (err || !row) {
        return res.status(401).json({ status: 'auth-error', message: 'Invalid token.' });
      }
      if (!row.hwid) {
        db.run('UPDATE tokens SET hwid = ? WHERE token = ?', [reqHwid, token], (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ status: 'error', message: 'Failed to lock HWID.' });
          }
          return next();
        });
      } else if (row.hwid !== reqHwid) {
        return res.status(403).json({ status: 'auth-error', message: 'HWID mismatch.' });
      } else {
        return next();
      }
    });
  }


app.post('/admin/generate-token', (req, res) => {
  const { adminPassword } = req.body;
  if (adminPassword !== 'changeThisPasswordToWhateverYouWant') {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const token = generateToken();
  //please do not use this, [please lang this aint safe brodie]
  db.run('INSERT INTO tokens (token) VALUES (?)', [token], (err) => {
    if (err) {
      return res.status(500).json({ status: 'error', message: 'Failed to generate token' });
    }
    return res.json({ status: 'success', data: { token } });
  });
});


app.get('/admin/tokens', (req, res) => {
    const { adminPassword } = req.query;
    if (adminPassword !== 'changeThisPasswordToWhateverYouWant') {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized'
        });
    }
    db.all('SELECT * FROM tokens', [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                status: 'error',
                message: 'Failed to fetch tokens'
            });
        }
        res.json({
            status: 'success',
            data: { tokens: rows }
        });
    });
});

app.delete('/admin/token/:token', (req, res) => {
    const { adminPassword } = req.body;
    const { token } = req.params;

    if (adminPassword !== 'changeThisPasswordToWhateverYouWant') {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized'
        });
    }
    db.run('DELETE FROM tokens WHERE token = ?', [token], (err) => {
        if (err) {
            return res.status(500).json({
                status: 'error',
                message: 'Failed to delete token'
            });
        }
        res.json({
            status: 'success',
            message: 'Token deleted'
        });
    });
});


//AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH AUTH
//==========================================================================


//CREATE WALLET MMEMONIC
app.get('/create-wallet', authbitch, async (req, res) => {
    try {
        const mnemonic = bip39.generateMnemonic(256);
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const derivedKey = ed25519.derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
        const keypair = Keypair.fromSeed(derivedKey.key);
        res.json({
            status: 'success',
            data: {
                publicKey: keypair.publicKey.toString(),
                mnemonic: mnemonic,
                privateKey: Buffer.from(keypair.secretKey).toString('base64')
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.post('/login', authbitch, async (req, res) => {
    try {
      const { mnemonic } = req.body;
      if (!mnemonic) {
        return res.status(400).json({ status: 'error', message: 'Mnemonic is required' });
      }
      if (!bip39.validateMnemonic(mnemonic)) {
        return res.status(400).json({ status: 'error', message: 'Invalid mnemonic' });
      }

      const seed = await bip39.mnemonicToSeed(mnemonic);
      const derivedKey = ed25519.derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
      const keypair = Keypair.fromSeed(derivedKey.key);
  
      return res.json({
        status: 'success',
        data: {
          publicKey: keypair.publicKey.toString(),
          privateKey: Buffer.from(keypair.secretKey).toString('base64'),
        },
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });
  

//get balance per addy
app.get('/balance/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const publicKey = new PublicKey(address);
        const solBalance = await connection.getBalance(publicKey);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId: TOKEN_PROGRAM_ID }
        );

        const tokens = tokenAccounts.value.map(accountInfo => ({
            mint: accountInfo.account.data.parsed.info.mint,
            amount: accountInfo.account.data.parsed.info.tokenAmount.uiAmount,
            decimals: accountInfo.account.data.parsed.info.tokenAmount.decimals
        }));

        res.json({
            status: 'success',
            data: {
                sol: solBalance / LAMPORTS_PER_SOL,
                tokens: tokens
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});


//junk
async function getOrCreateAssociatedTokenAccount(connection, payer, mintAddress) {
    const mint = new PublicKey(mintAddress);
    const owner = payer.publicKey;
    const associatedTokenAddress = await getAssociatedTokenAddress(
        mint,
        owner,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const existingInfo = await connection.getAccountInfo(associatedTokenAddress);
    if (existingInfo) {
        console.log('Token account already exists:', associatedTokenAddress.toString());
        return associatedTokenAddress;
    }
    const instruction = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        associatedTokenAddress,
        owner,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = payer.publicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

    transaction.sign(payer);

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer],   // signers
        { skipPreflight: false, maxRetries: 3 }
    );

    console.log('Created ATA with signature:', signature);
    return associatedTokenAddress;
}
async function attemptVersionedTx(connection, versionedTx, blockhashWithExpiryBlockHeight, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`create-token-account attempt ${attempt}/${maxAttempts}`);

        // If not first attempt, fetch a new blockhash
        if (attempt > 1) {
            blockhashWithExpiryBlockHeight = await connection.getLatestBlockhash('confirmed');
            versionedTx.message.recentBlockhash = blockhashWithExpiryBlockHeight.blockhash;

            // Re-sign after updating recentBlockhash
            versionedTx.sign([]);
            // Because the original signers are already included, you usually only
            // need to re-sign if the message changed in a way that invalidated sigs.
            // In old flow, sometimes you must sign again. If you get "not signed" error,
            // re-sign with the wallet key: versionedTx.sign([wallet]);
        }

        // We pass the serialized transaction to "transactionSenderAndConfirmationWaiter"

        const response = await trans_send_wait({
            connection,
            serializedTransaction: versionedTx,
            blockhashWithExpiryBlockHeight
        });

        if (response) {
            // That means the transaction got confirmed
            return response;
        }

        console.log('Transaction expired, will retry with new blockhash...');
        // If it expired, loop continues until attempts are exhausted
    }

    return null; // indicates failure after all attempts
}
//end junk


app.post('/create-token-account', authbitch, async (req, res) => {
    try {
        const { mint, privateKey } = req.body;
        if (!mint || !privateKey) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required parameters: mint and privateKey'
            });
        }
        
        //dec b64 to orgi wallet
        const wallet = Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
        const mintPubkey = new PublicKey(mint);

        const associatedTokenAddress = await getAssociatedTokenAddress(
            mintPubkey,
            wallet.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );


        //DEBUG DATA
        console.log("Associated Token Address:", associatedTokenAddress?.toString());
        console.log("Owner Wallet:", wallet?.publicKey?.toString());
        console.log("Mint:", mint);


        const inf = await connection.getAccountInfo(associatedTokenAddress);
        if (inf) {
            console.log('Token account already exists:', associatedTokenAddress.toString());
            console.log("associatedTokenAddress:", associatedTokenAddress?.toString());
            console.log("wallet.publicKey:", wallet?.publicKey?.toString());
            console.log("mint:", mint);

            const responseData = {
                status: 'success',
                data: {
                    tokenAccount: associatedTokenAddress.toString(),
                    owner: wallet.publicKey.toString(),
                    mint,
                }
            };

            console.log("Full response data:", responseData);

            return res.json(responseData); // Try without status code
        }

        console.log('Creating token account:', associatedTokenAddress.toString());

        // Build the ATA instruction
        const createAtaIx = createAssociatedTokenAccountInstruction(
            wallet.publicKey,         // payer
            associatedTokenAddress,   // ATA to create
            wallet.publicKey,         // owner of the ATA
            mintPubkey,               // which token mint
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const b_h_BH = await connection.getLatestBlockhash('confirmed');
        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: b_h_BH.blockhash,
            instructions: [createAtaIx],
        }).compileToLegacyMessage();

        const versionedTx = new VersionedTransaction(messageV0);
        versionedTx.sign([wallet]);

        const result = await try_swap_Sol(
            connection,
            versionedTx,
            b_h_BH,
            3
        );

        if (!result) {
            return res.status(500).json({
                status: 'error',
                message: 'Transaction failed to confirm after multiple attempts'
            });
        }

        const signature = result.transaction.signatures[0];
        console.log('create-token-account success, signature:', signature);

        return res.json({
            status: 'success',
            data: {
                tokenAccount: associatedTokenAddress.toString(),
                owner: wallet.publicKey.toString(),
                mint,
                signature,
                explorerUrl: `https://solscan.io/tx/${signature}`
            }
        });

    } catch (error) {
        console.error('create-token-account error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});


// tax :(
app.get('/quote', async (req, res) => {
    try {
        const { inputMint, outputMint, amount } = req.query;

        if (!inputMint || !outputMint || !amount) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required parameters',
            });
        }

        const quote = await jupiterQuoteApi.quoteGet({
            inputMint,
            outputMint,
            amount,
        });

        res.json({
            status: 'success',
            data: quote,
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
        });
    }
});


const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function promiseRetry(fn, options) {
    let lastError;
    for (let attempt = 0; attempt <= options.retries; attempt++) {
        try {
            return await fn((error) => {
                lastError = error;
                throw error;
            });
        } catch (error) {
            if (attempt === options.retries) throw lastError || error;
            await wait(options.minTimeout);
        }
    }
}

async function trans_send_wait({
    connection,
    serializedTransaction,
    blockhashWithExpiryBlockHeight
}) {
    const txid = await connection.sendTransaction(
        serializedTransaction
    );

    const controller = new AbortController();
    const abortSignal = controller.signal;

    const abortableResender = async () => {
        while (!abortSignal.aborted) {
          await wait(2000);
          try {
            await connection.sendTransaction(serializedTransaction);
          } catch (e) {
            if (e.name === "SendTransactionError") {
              try {
                const logs = await e.getLogs();
                console.warn(`Failed to resend transaction: ${e.message}. Logs: ${logs}`);
              } catch (logErr) {
                console.warn(`Failed to resend transaction: ${e.message}. Unable to get logs: ${logErr}`);
              }
              if (e.message.includes("already been processed")) {
                break;
              }
            } else {
              console.warn(`Failed to resend transaction: ${e}`);
            }
          }
        }
      };

    try {
        abortableResender();
        const lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight;

        await Promise.race([
            connection.confirmTransaction(
                {
                    ...blockhashWithExpiryBlockHeight,
                    lastValidBlockHeight,
                    signature: txid,
                    abortSignal,
                },
                "confirmed"
            ),
            new Promise(async (resolve) => {
                while (!abortSignal.aborted) {
                    await wait(2000);
                    const tx = await connection.getSignatureStatus(txid, {
                        searchTransactionHistory: false,
                    });
                    if (tx?.value?.confirmationStatus === "confirmed") {
                        resolve(tx);
                    }
                }
            }),
        ]);
    } catch (e) {
        if (e?.constructor?.name === 'TransactionExpiredBlockheightExceededError' ||
            e instanceof TransactionExpiredBlockheightExceededError) {
            return null;
        } else {
            throw e;
        }
    } finally {
        controller.abort();
    }

    const response = await promiseRetry(
        async (retry) => {
            const response = await connection.getTransaction(txid, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
            });
            if (!response) {
                retry(response);
            }
            return response;
        },
        {
            retries: 5,
            minTimeout: 1000,
        }
    );

    return response;
}


async function try_swap_Sol(connection, transaction, blockhashWithExpiryBlockHeight, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Swap attempt ${attempt}/${maxAttempts}`);

        if (attempt > 1) {
            blockhashWithExpiryBlockHeight = await connection.getLatestBlockhash('confirmed');
            transaction.message.recentBlockhash = blockhashWithExpiryBlockHeight.blockhash;
        }

        const result = await trans_send_wait({
            connection,
            serializedTransaction: transaction,
            blockhashWithExpiryBlockHeight
        });

        if (result) {
            return result;
        }

        if (attempt < maxAttempts) {
            console.log('Transaction expired, retrying with new blockhash...');
            await wait(2000);
        }
    }
    return null;
}


//SWAP SOL to whatever the fuck the user wants
app.post('/swap', authbitch, async (req, res) => {
    try {
        const { inputMint, outputMint, amount, privateKey, slippage = 50, prioritizationFeeLamports } = req.body;

        if (!inputMint || !outputMint || !amount || !privateKey) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required parameters'
            });
        }

        const wallet = Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));

        try {
            const quote = await jupiterQuoteApi.quoteGet({
                inputMint,
                outputMint,
                amount,
                slippageBps: slippage,
                prioritizationFeeLamports: prioritizationFeeLamports
            });

            if (!quote || !quote.outAmount || parseInt(quote.outAmount, 10) === 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'No valid swap route found'
                });
            }

            const swapResult = await fetch('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    quoteResponse: quote,
                    userPublicKey: wallet.publicKey.toString(),
                    wrapAndUnwrapSol: true,
                })
            });

            const swapData = await swapResult.json();
            if (!swapData.swapTransaction) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to get swap transaction'
                });
            }

            const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(transactionBuf);

            const blockhashWithExpiryBlockHeight = await connection.getLatestBlockhash('confirmed');
            transaction.message.recentBlockhash = blockhashWithExpiryBlockHeight.blockhash;

            transaction.sign([wallet]);

            console.log('Sending and confirming swap transaction...');


            const result = await try_swap_Sol(connection, transaction, blockhashWithExpiryBlockHeight);

            if (!result) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Transaction failed to confirm after multiple attempts'
                });
            }

            console.log('Swap transaction confirmed successfully');

            return res.json({
                status: 'success',
                data: {
                    signature: result.transaction.signatures[0],
                    explorerUrl: `https://solscan.io/tx/${result.transaction.signatures[0]}`,
                    inputMint,
                    outputMint,
                    amount,
                    expectedOutputAmount: quote.outAmount
                }
            });

        } catch (error) {
            console.error('Swap operation failed:', error);
            return res.status(500).json({
                status: 'error',
                message: error.message || 'Failed to complete swap',
                details: error.logs ? error.logs : undefined
            });
        }

    } catch (error) {
        console.error('Swap endpoint error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to complete swap',
            details: error.stack
        });
    }
});



//CONVERTS ALL THE COINS BACK TO SOL
app.post('/dumpAllTokensToSol', authbitch, async (req, res) => {
    try {
        const { privateKey, slippageBps = 50 } = req.body;
        if (!privateKey) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing "privateKey" (base64) in request body.'
            });
        }

        let wallet;
        try {
            const secretKey = Buffer.from(privateKey, 'base64');
            wallet = Keypair.fromSecretKey(secretKey);
        } catch (err) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid base64 privateKey provided: ' + err.message
            });
        }

        let tokenAccounts;
        try {
            tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                wallet.publicKey,
                { programId: TOKEN_PROGRAM_ID }
            );
        } catch (err) {
            return res.status(500).json({
                status: 'error',
                message: 'Failed to fetch token accounts: ' + err.message
            });
        }

        if (!tokenAccounts.value || tokenAccounts.value.length === 0) {
            return res.json({
                status: 'success',
                data: {
                    totalSwaps: 0,
                    totalSolReceived: 0,
                    results: [],
                    note: 'No token accounts found.'
                }
            });
        }

        const swapResults = [];
        let totalSolReceived = 0;

        for (const { account } of tokenAccounts.value) {
            const parsedInfo = account.data.parsed.info;
            const mint = parsedInfo.mint;
            const decimals = parsedInfo.tokenAmount.decimals;
            const uiAmount = parsedInfo.tokenAmount.uiAmount;

            if (!uiAmount || uiAmount <= 0 || mint === SOL_MINT) {
                continue;
            }

            const result = { mint, uiAmount, status: 'pending' };

            try {
                const rawAmount = Math.floor(uiAmount * 10 ** decimals);
                if (rawAmount <= 0) {
                    result.status = 'failed';
                    result.reason = 'Dust amount (rounded to 0). Skipping.';
                    swapResults.push(result);
                    continue;
                }

                let quote;
                try {
                    quote = await jupiterQuoteApi.quoteGet({
                        inputMint: mint,
                        outputMint: SOL_MINT,
                        amount: rawAmount.toString(),
                        slippageBps
                    });
                } catch (quoteErr) {
                    result.status = 'failed';
                    result.reason = `Error getting quote: ${quoteErr.message}`;
                    swapResults.push(result);
                    continue;
                }

                if (!quote || !quote.outAmount || parseInt(quote.outAmount, 10) === 0) {
                    result.status = 'failed';
                    result.reason = 'No swap route found or outAmount=0.';
                    swapResults.push(result);
                    continue;
                }

                let swapResponse, swapData;
                try {
                    swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            quoteResponse: quote,
                            userPublicKey: wallet.publicKey.toString(),
                            wrapAndUnwrapSol: true,
                        }),
                    });
                    swapData = await swapResponse.json();
                } catch (swapFetchErr) {
                    result.status = 'failed';
                    result.reason = `Failed to fetch swap transaction: ${swapFetchErr.message}`;
                    swapResults.push(result);
                    continue;
                }

                if (!swapData || !swapData.swapTransaction) {
                    result.status = 'failed';
                    result.reason = 'swapTransaction missing in Jupiter response.';
                    swapResults.push(result);
                    continue;
                }

                let transaction;
                try {
                    const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
                    transaction = VersionedTransaction.deserialize(transactionBuf);
                } catch (txDeserializeErr) {
                    result.status = 'failed';
                    result.reason = `Failed to deserialize transaction: ${txDeserializeErr.message}`;
                    swapResults.push(result);
                    continue;
                }

                let latestBlockhash;
                try {
                    latestBlockhash = await connection.getLatestBlockhash('confirmed');
                    transaction.message.recentBlockhash = latestBlockhash.blockhash;
                    transaction.sign([wallet]);
                } catch (blockhashErr) {
                    result.status = 'failed';
                    result.reason = `Blockhash/sign error: ${blockhashErr.message}`;
                    swapResults.push(result);
                    continue;
                }

                const txResult = await try_swap_Sol(connection, transaction, latestBlockhash, 3);
                if (!txResult) {
                    result.status = 'failed';
                    result.reason = `Transaction failed to confirm after multiple attempts for mint ${mint}`;
                    swapResults.push(result);
                    continue;
                }
                const signature = txResult.transaction.signatures[0];

                const outAmountLamports = parseInt(quote.outAmount, 10);
                const outAmountSol = outAmountLamports / LAMPORTS_PER_SOL;
                totalSolReceived += outAmountSol;

                result.status = 'success';
                result.signature = signature;
                result.explorerUrl = `https://solscan.io/tx/${signature}`;
                result.receivedSol = outAmountSol;
                swapResults.push(result);

            } catch (innerErr) {
                console.error('Token swap error:', innerErr);
                result.status = 'failed';
                result.reason = innerErr.message || 'Unknown error.';
                swapResults.push(result);
            }
        }

        if (swapResults.length === 0) {
            return res.json({
                status: 'success',
                data: {
                    totalSwaps: 0,
                    totalSolReceived: 0,
                    results: [],
                    note: 'No SPL tokens found to swap.'
                }
            });
        }

        const successfulSwaps = swapResults.filter(r => r.status === 'success');
        const totalSwaps = successfulSwaps.length;

        return res.json({
            status: 'success',
            data: {
                totalSwaps,
                totalSolReceived,
                results: swapResults,
                note: totalSwaps > 0
                    ? `Successfully swapped ${totalSwaps} tokens into SOL.`
                    : 'No token swaps succeeded.'
            }
        });

    } catch (error) {
        console.error('dumpAllTokensToSol error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to dump tokens into SOL'
        });
    }
});

app.post('/transfer-sol', authbitch, async (req, res) => {
    try {
        const { privateKey, recipientAddress, amount, priorityFee } = req.body;

        // Validate input parameters
        if (!privateKey || !recipientAddress || !amount) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required parameters: privateKey, recipientAddress, and amount'
            });
        }

        const lamports = Math.round(amount * LAMPORTS_PER_SOL);
        const wallet = Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
        const recipient = new PublicKey(recipientAddress);
        const instruction = SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: recipient,
            lamports: lamports
        });

        const blockhashWithExpiryBlockHeight = await connection.getLatestBlockhash('confirmed');

        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhashWithExpiryBlockHeight.blockhash,
            instructions: [instruction]
        }).compileToLegacyMessage();
        const transaction = new VersionedTransaction(messageV0);

        if (priorityFee && priorityFee > 0) {
            transaction.message.recentBlockhash = blockhashWithExpiryBlockHeight.blockhash;
            transaction.message.setComputeUnitLimit(priorityFee);
        }

        transaction.sign([wallet]);

        const result = await try_swap_Sol(
            connection,
            transaction,
            blockhashWithExpiryBlockHeight,
            3 
        );

        if (!result) {
            return res.status(500).json({
                status: 'error',
                message: 'Transaction failed to confirm after multiple attempts'
            });
        }

        const signature = result.transaction.signatures[0];
        
        return res.json({
            status: 'success',
            data: {
                signature,
                amount,
                from: wallet.publicKey.toString(),
                to: recipientAddress,
                explorerUrl: `https://solscan.io/tx/${signature}`
            }
        });

    } catch (error) {
        console.error('Transfer SOL error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to transfer SOL'
        });
    }
});




//DEV STUFF
app.post('/request-airdrop', authbitch, async (req, res) => {
    try {
        const { address } = req.body;

        if (!address) {
            return res.status(400).json({
                status: 'error',
                message: 'Address is required'
            });
        }

        const publicKey = new PublicKey(address);
        const signature = await connection.requestAirdrop(
            publicKey,
            2 * LAMPORTS_PER_SOL // Request 2 SOL
        );

        await connection.confirmTransaction(signature);

        res.json({
            status: 'success',
            data: {
                signature,
                amount: 2
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});