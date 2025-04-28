import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, create, fetchAssetV1 } from '@metaplex-foundation/mpl-core';
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';
import {
  createGenericFile,
  createGenericFileFromJson,
  createNoopSigner,
  createSignerFromKeypair,
  generateSigner,
  GenericFile,
  GenericFileOptions,
  KeypairSigner,
  publicKey,
  signerIdentity,
  signerPayer,
  signTransaction,
  sol,
  Umi,
} from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { z } from 'zod';
import { ConfigService } from './config/config.service';
import {
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToCheckedInstruction,
  createUpdateAuthorityInstruction,
  ExtensionType,
  getAssociatedTokenAddress,
  getMintLen,
  LENGTH_SIZE,
  createSetAuthorityInstruction,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createInitializeInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata';
import { NetworkType } from './common/decorators/network.decorator';

const uri = z.string().url().max(200);

const attributes = z
  .array(
    z
      .object({
        trait_type: z.string().max(64),
        value: z.string().max(64),
      })
      .strict(),
  )
  .max(10);

const metadataStandard = z
  .object({
    name: z.string().max(32),
    description: z.string().max(2000),
    image: uri,
    // animation_url: z.string().optional(), // will be supported later
    external_url: uri.optional(),
    attributes: attributes,
    properties: z
      .object({
        files: z
          .array(
            z.object({
              uri: uri,
              type: z.enum([
                'image/png',
                'image/jpeg',
                'image/jpg',
                'image/gif',
                'image/webp',
              ]),
              cdn: z.boolean().optional(),
            }),
          )
          .max(10),
        category: z.enum(['image']),
      })
      .strict(),
  })
  .strict();

export const createMintSchema = z
  .object({
    metadata: metadataStandard,
  })
  .strict();

export type MintSchemaDto = z.infer<typeof createMintSchema>;

const tokenMetadataStandard = z
  .object({
    name: z.string().max(32),
    symbol: z.string().min(1),
    description: z.string().max(2000),
    image: uri,
    attributes: attributes,
  })
  .strict();

export const createTokenSchema = z.object({
  metadata: tokenMetadataStandard,
  decimals: z.number().min(1).max(9),
  supply: z.number().min(1).max(Number.MAX_SAFE_INTEGER), // NOTE: actual max is 2n ** 64n - 1n
  allowUpdateAuthority: z.boolean().default(false),
  revokeMintAuthority: z.boolean().default(false),
  revokeUpdateAuthority: z.boolean().default(false),
  revokeFreezeAuthority: z.boolean().default(false),
});

type NFT = {
  name: string;
  description: string;
  imageURL: string;
  solscanURL: string;
};

export type CreateTokenSchemaDto = z.infer<typeof createTokenSchema>;

const umi = (endpoint: string) => createUmi(endpoint).use(mplCore());
const connection = (endpoint: string) =>
  new Connection(endpoint, {
    commitment: 'confirmed',
  });

@Injectable()
export class AppService {
  private devnetUmi: Umi;
  private mainnetUmi: Umi;
  private devnetConnection: Connection;
  private mainnetConnection: Connection;
  private devnetPayerSigner: KeypairSigner;
  private mainnetPayerSigner: KeypairSigner;
  private payerKeypair: Keypair;
  private readonly logger = new Logger(AppService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const devnetRPCEndpoint = this.config.env.DEVNET_SOLANA_RPC_BACKEND;
    const mainnetRPCEndpoint = this.config.env.MAINNET_SOLANA_RPC_BACKEND;

    this.devnetUmi = umi(devnetRPCEndpoint);
    this.mainnetUmi = umi(mainnetRPCEndpoint);

    this.devnetConnection = connection(devnetRPCEndpoint);
    this.mainnetConnection = connection(mainnetRPCEndpoint);

    const secretKey = new Uint8Array(this.config.env.WALLET_PRIVATE_KEY);
    this.payerKeypair = Keypair.fromSecretKey(secretKey);

    this.devnetPayerSigner = createSignerFromKeypair(
      this.devnetUmi,
      this.devnetUmi.eddsa.createKeypairFromSecretKey(secretKey),
    );

    this.mainnetPayerSigner = createSignerFromKeypair(
      this.mainnetUmi,
      this.mainnetUmi.eddsa.createKeypairFromSecretKey(secretKey),
    );

    this.devnetUmi.use(
      irysUploader({
        address: this.config.env.DEVNET_IRYS_URL,
        payer: this.devnetPayerSigner,
      }),
    );

    this.mainnetUmi.use(
      irysUploader({
        address: this.config.env.MAINNET_IRYS_URL,
        payer: this.mainnetPayerSigner,
      }),
    );
  }

  private async logUploadPrice(
    genericFile: GenericFile,
    type: 'image' | 'metadata',
    network: NetworkType,
  ) {
    const umi = network === 'devnet' ? this.devnetUmi : this.mainnetUmi;

    const price = await umi.uploader.getUploadPrice([genericFile]);

    const decimalDivisor = BigInt(Math.pow(10, price.decimals));
    const solAmount = Number(price.basisPoints) / Number(decimalDivisor);

    this.logger.log(`${solAmount} SOL to upload ${type}`);
  }

  public async uploadImage(
    image: Express.Multer.File,
    network: NetworkType,
  ): Promise<{ image_url: string }> {
    try {
      const umi = network === 'devnet' ? this.devnetUmi : this.mainnetUmi;
      const buffer = image.buffer;

      const fileOptions: GenericFileOptions = {
        displayName: image.originalname,
        contentType: image.mimetype,
      };

      const genericFile = createGenericFile(
        buffer,
        image.originalname,
        fileOptions,
      );

      const [url] = await umi.uploader.upload([genericFile]);

      await this.logUploadPrice(genericFile, 'image', network);

      return { image_url: url };
    } catch (error) {
      this.logger.error('Error uploading to Irys:', error);
      throw error;
    }
  }

  // NOTE: Eventually run a background process to prefetch the list and cache in some form of persistent storage
  async listNFTs(network: NetworkType) {
    const nfts = await this.prisma.nft.findMany({
      where: {
        network,
      },
    });

    const items: NFT[] = nfts.map((nft) => {
      return {
        name: nft.name,
        description: nft.description,
        imageURL: nft.imageUrl,
        solscanURL: `https://solscan.io/token/${nft.assetId}?cluster=${network}`,
      };
    });

    return { items };

    // console.log('nfts', nfts);
    //
    // const umi = network === 'devnet' ? this.devnetUmi : this.mainnetUmi;
    //
    // const connection =
    //   network === 'devnet' ? this.devnetConnection : this.mainnetConnection;
    //
    // const METAPLEX_CORE_PROGRAM_ID =
    //   'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
    // const payerPublicKey = this.payerKeypair.publicKey;
    //
    // const assetIds: string[] = [];
    //
    // const backendSignatures = await connection.getSignaturesForAddress(
    //   payerPublicKey,
    //   { limit: 10 },
    // );
    //
    // for (const sigInfo of backendSignatures) {
    //   const tx = await connection.getTransaction(sigInfo.signature, {
    //     maxSupportedTransactionVersion: 1, // Support versioned transactions
    //     commitment: 'confirmed', // Add proper commitment
    //   });
    //
    //   if (
    //     tx &&
    //     tx.transaction &&
    //     tx.transaction.message.getAccountKeys().get(0)?.toBase58() ===
    //       this.payerKeypair.publicKey.toBase58()
    //   ) {
    //     const instructions = tx.transaction.message.compiledInstructions;
    //     const accountKeys = tx.transaction.message.getAccountKeys();
    //
    //     for (const instruction of instructions) {
    //       const programId = accountKeys.get(instruction.programIdIndex);
    //
    //       if (programId?.toBase58() === METAPLEX_CORE_PROGRAM_ID) {
    //         const accountIndexes = instruction.accountKeyIndexes;
    //         const accounts = accountIndexes.map((idx) =>
    //           accountKeys.get(idx)?.toBase58(),
    //         );
    //
    //         const assetId = accounts[0];
    //         if (assetId) {
    //           assetIds.push(assetId);
    //         }
    //       }
    //     }
    //   }
    // }
    //
    // const items: NFT[] = [];
    // for (const assetId of assetIds) {
    //   console.log('assetId', assetId);
    //   const mintAddress = publicKey(assetId);
    //   const asset = await fetchAssetV1(umi, mintAddress);
    //
    //   const offchainMetadataResponse = await fetch(asset.uri);
    //
    //   const offchainMetadata =
    //     (await offchainMetadataResponse.json()) as MintSchemaDto['metadata'];
    //
    //   items.push({
    //     name: offchainMetadata.name,
    //     description: offchainMetadata.description,
    //     imageURL: offchainMetadata.image,
    //     solscanURL: `https://solscan.io/token/${mintAddress}?cluster=${network}`,
    //   });
    // }
    //
    // console.log('items', items);
    //
    // return {
    //   items,
    // };
  }

  async createNft(
    recipientPublicKey: string,
    mintSchema: MintSchemaDto,
    network: NetworkType,
  ): Promise<{ tx: string }> {
    const umi = network === 'devnet' ? this.devnetUmi : this.mainnetUmi;
    const payerSigner =
      network === 'devnet' ? this.devnetPayerSigner : this.mainnetPayerSigner;

    const signerPublicKey = publicKey(recipientPublicKey);

    await this.logUploadPrice(
      createGenericFileFromJson(mintSchema.metadata),
      'metadata',
      network,
    );

    const metadataUri = await umi.uploader.uploadJson(mintSchema.metadata);

    const nftMint = generateSigner(umi);

    umi.use(signerPayer(payerSigner)); // only set the payer

    const noopSigner = createNoopSigner(signerPublicKey);

    umi.use(signerIdentity(noopSigner, false)); // only set the signer to be

    const builder = create(umi, {
      asset: nftMint,
      updateAuthority: signerPublicKey,
      name: mintSchema.metadata.name,
      uri: metadataUri,
      payer: payerSigner,
    }).add(
      transferSol(umi, {
        source: noopSigner,
        destination: payerSigner.publicKey,
        amount: sol(0.05),
      }),
    );

    const unsignedTransaction = await builder.buildWithLatestBlockhash(umi);

    const preSignedTransaction = await signTransaction(unsignedTransaction, [
      nftMint,
      payerSigner,
      // NOTE: missing the signers signature - handled on frontend
    ]);

    const web3Transaction = toWeb3JsTransaction(preSignedTransaction);

    const serialized = Buffer.from(web3Transaction.serialize()).toString(
      'base64',
    );

    return { tx: serialized };
  }

  async createToken(
    recipientPublicKeyRaw: string,
    createTokenSchema: CreateTokenSchemaDto,
    network: NetworkType,
  ): Promise<{ tx: string }> {
    const umi = network === 'devnet' ? this.devnetUmi : this.mainnetUmi;
    const connection =
      network === 'devnet' ? this.devnetConnection : this.mainnetConnection;

    const recipientPublicKey = new PublicKey(recipientPublicKeyRaw);

    await this.logUploadPrice(
      createGenericFileFromJson(createTokenSchema.metadata),
      'metadata',
      network,
    );

    const offchainMetadataUri = await umi.uploader.uploadJson(
      createTokenSchema.metadata,
    );

    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    const mintAuthority = recipientPublicKey;
    const updateAuthority = recipientPublicKey;
    const freezeAuthority = createTokenSchema.revokeFreezeAuthority
      ? null
      : recipientPublicKey;

    const onChainMetadata: TokenMetadata = {
      updateAuthority,
      mint: mint,
      name: createTokenSchema.metadata.name,
      symbol: createTokenSchema.metadata.symbol,
      uri: offchainMetadataUri,
      additionalMetadata: [], // NOTE: currently not supporting additionalMetadata
    };

    const metadataExtensionSize = TYPE_SIZE + LENGTH_SIZE;
    const metadataSize = pack(onChainMetadata).length;
    const mintAccountSize = getMintLen([ExtensionType.MetadataPointer]);

    const mintAccountRent = await connection.getMinimumBalanceForRentExemption(
      mintAccountSize + metadataExtensionSize + metadataSize,
    );

    const decimals = createTokenSchema.decimals;
    const supply = createTokenSchema.supply;
    const mintAmount = supply * Math.pow(10, decimals);

    const fee = 0.1 * LAMPORTS_PER_SOL;

    const transferInstruction = SystemProgram.transfer({
      fromPubkey: recipientPublicKey,
      toPubkey: this.payerKeypair.publicKey,
      lamports: fee,
    });

    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: this.payerKeypair.publicKey,
      newAccountPubkey: mint,
      space: mintAccountSize,
      lamports: mintAccountRent,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMetadataPointerInstruction =
      createInitializeMetadataPointerInstruction(
        mint,
        updateAuthority,
        mint,
        TOKEN_2022_PROGRAM_ID,
      );

    const initializeMintInstruction = createInitializeMintInstruction(
      mint,
      decimals,
      mintAuthority,
      freezeAuthority,
      TOKEN_2022_PROGRAM_ID,
    );

    const initializeMetadataInstruction = createInitializeInstruction({
      metadata: mint,
      updateAuthority,
      mint,
      mintAuthority,
      name: onChainMetadata.name,
      symbol: onChainMetadata.symbol,
      uri: onChainMetadata.uri,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const ata = await getAssociatedTokenAddress(
      mint,
      recipientPublicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const createATAInstruction = createAssociatedTokenAccountInstruction(
      this.payerKeypair.publicKey,
      ata,
      recipientPublicKey,
      mint,
      TOKEN_2022_PROGRAM_ID,
    );

    const mintTokens = createMintToCheckedInstruction(
      mint,
      ata,
      recipientPublicKey,
      mintAmount,
      decimals,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );

    const instructions = [
      transferInstruction,
      createAccountInstruction,
      initializeMetadataPointerInstruction,
      initializeMintInstruction,
      initializeMetadataInstruction,
      createATAInstruction,
      mintTokens,
    ];

    if (createTokenSchema.revokeMintAuthority) {
      const revokeMintAuthorityInstruction = createSetAuthorityInstruction(
        mint,
        mintAuthority,
        AuthorityType.MintTokens,
        null,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );
      instructions.push(revokeMintAuthorityInstruction);
    }

    if (createTokenSchema.revokeUpdateAuthority) {
      const revokeUpdateAuthorityInstruction = createUpdateAuthorityInstruction(
        {
          metadata: mint,
          oldAuthority: updateAuthority,
          newAuthority: null,
          programId: TOKEN_2022_PROGRAM_ID,
        },
      );
      instructions.push(revokeUpdateAuthorityInstruction);
    }

    const { blockhash } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: this.payerKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([this.payerKeypair, mintKeypair]);

    const serialized = Buffer.from(transaction.serialize()).toString('base64');

    return { tx: serialized };
  }
}
