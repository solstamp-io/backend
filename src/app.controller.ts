import {
  Controller,
  Post,
  Get,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  UseGuards,
} from '@nestjs/common';
import {
  AppService,
  createMintSchema,
  MintSchemaDto,
  createTokenSchema,
  CreateTokenSchemaDto,
} from './app.service';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { FileInterceptor } from '@nestjs/platform-express';
import { PublicKeyGuard } from './common/guards/public-key-guard';
import { PublicKey } from './common/decorators/public-key.decorator';
import { NetworkType, Network } from './common/decorators/network.decorator';

const MB_TO_BYTES = 1_048_576;

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('image')
  @UseGuards(PublicKeyGuard)
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @Network() network: NetworkType,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 30 * MB_TO_BYTES }),
          new FileTypeValidator({ fileType: 'image/png' }), // NOTE: can be a Regex to include more file types
        ],
      }),
    )
    image: Express.Multer.File,
  ) {
    return await this.appService.uploadImage(image, network);
  }

  @Post('token')
  @UseGuards(PublicKeyGuard)
  async createToken(
    @Network() network: NetworkType,
    @PublicKey() publicKey: string,
    @Body(new ZodValidationPipe(createTokenSchema))
    tokenSchemaDto: CreateTokenSchemaDto,
  ) {
    return await this.appService.createToken(
      publicKey,
      tokenSchemaDto,
      network,
    );
  }

  @Get('nft')
  async listNFTs(@Network() network: NetworkType) {
    return await this.appService.listNFTs(network);
  }

  @Post('nft')
  @UseGuards(PublicKeyGuard)
  async createNft(
    @Network() network: NetworkType,
    @PublicKey() publicKey: string,
    @Body(new ZodValidationPipe(createMintSchema)) mintSchemaDto: MintSchemaDto,
  ) {
    return await this.appService.createNft(publicKey, mintSchemaDto, network);
  }
}
