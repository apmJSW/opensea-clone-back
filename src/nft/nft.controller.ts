import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BigNumber } from 'ethers';
import { map } from 'rxjs';
import { NftService } from './nft.service';

@Controller('nft')
export class NftController {
  constructor(private nftService: NftService) {}

  @Get('/contract/:address')
  async getContractMetadata(@Param() param) {
    const { address } = param;
    return this.nftService.getNftContract(address);
  }

  @Get('/contract/:address/tokens')
  async getNfts(@Param() param, @Query() query) {
    const { address } = param;
    const { startToken } = query;

    return this.nftService.getNfts(address, startToken).pipe(
      map((result) => ({
        result,
        nextToken: this.nftService.getNextToken(result),
      })),
    );
  }

  @Get(`/contract/:address/tokens/:tokenId`)
  async getOneNft(@Param() param) {
    const { address, tokenId } = param;

    return this.nftService.getNft(address, tokenId);
  }

  @Get(`/contract/:address/tokens/:tokenId/history`)
  async getNftHistory(@Param() param) {
    const { address, tokenId } = param;

    return this.nftService.getRecentHistory(address).pipe(
      map((history) => {
        return (history || [])
          .filter((event) =>
            BigNumber.from(event.erc721TokenId).eq(BigNumber.from(tokenId)),
          )
          .slice(0, 3);
      }),
    );
  }
}
