import { OrderSig, SolidityOrder } from './order.dto';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ethers, BigNumber } from 'ethers';
import { erc721Abi, exchangeAbi, proxyRegistryAbi } from './order.abi';
import { Order } from '../entities';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

@Injectable()
export class OrderService {
  private readonly alchemyKey: string;
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly proxyRegistryContract: ethers.Contract;
  private readonly exchangeAddress: string;
  private readonly exchangeContract: ethers.Contract;

  constructor(
    configService: ConfigService,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
  ) {
    this.alchemyKey = configService.get('ALCHEMY_KEY');
    const network = configService.get('ALCHEMY_NETWORK');

    this.provider = new ethers.providers.AlchemyProvider(
      network,
      this.alchemyKey,
    );

    this.proxyRegistryContract = new ethers.Contract(
      configService.get('PROXY_REGISTRY_CONTRACT_ADDRESS'),
      proxyRegistryAbi,
    );

    this.exchangeAddress = configService.get('EXCHANGE_CONTRACT_ADDRESS');
    this.exchangeContract = new ethers.Contract(
      this.exchangeAddress,
      exchangeAbi,
    );
  }

  async generateSellOrder({ maker, contract, tokenId, price, expirationTime }) {
    const solidityOrder = {
      exchange: this.exchangeAddress,
      maker,
      taker: '0x0000000000000000000000000000000000000000',
      saleSide: 1,
      saleKind: 0,
      target: contract,
      paymentToken: '0x0000000000000000000000000000000000000000',
      calldata_: [
        '0x42842e0e',
        ethers.utils.hexZeroPad(maker, 32).replace('0x', ''),
        ethers.utils.hexZeroPad('0x00', 32).replace('0x', ''),
        this.toUint256(tokenId),
      ].join(''),
      replacementPattern: [
        '00000000',
        '0000000000000000000000000000000000000000000000000000000000000000',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ].join(''),
      staticTarget: '0x0000000000000000000000000000000000000000',
      staticExtra: '0x',
      basePrice: BigNumber.from(price).toHexString(),
      endPrice: BigNumber.from(price).toHexString(),
      listingTime: 0,
      expirationTime,
      salt: ethers.utils.hexZeroPad(ethers.utils.randomBytes(32), 32),
    } as SolidityOrder;

    const order = new Order();
    order.raw = JSON.stringify(solidityOrder);
    order.maker = maker;
    order.contractAddress = contract();
    order.tokenId = this.toUint256(tokenId);
    order.price = this.toUint256(price);
    order.expirationTime = expirationTime;
    order.isSell = true;
    order.verified = false;

    return await this.orderRepository.save(order);
  }

  async generateBuyOrderFromFixedPriceSell(orderId: number, maker: string) {
    const order = await this.orderRepository.findOneBy({
      id: orderId,
      verified: true,
      isSell: true,
    });

    if (!order) {
      throw new HttpException('not exist', HttpStatus.BAD_REQUEST);
    }

    if (order.expirationTime < new Date().getTime() / 1000) {
      throw new HttpException('expired order', HttpStatus.BAD_REQUEST);
    }

    const sellOrder = JSON.parse(order.raw);

    if (sellOrder.saleKind !== 0) {
      throw new HttpException('not fixed price', HttpStatus.BAD_REQUEST);
    }

    return {
      exchange: this.exchangeAddress,
      maker,
      taker: '0x0000000000000000000000000000000000000000',
      saleSide: 0,
      saleKind: 0,
      target: sellOrder.target,
      paymentToken: sellOrder.paymentToken,
      calldata_: [
        '0x42842e0e',
        ethers.utils.hexZeroPad('0x00', 32).replace('0x', ''),
        ethers.utils.hexZeroPad(maker, 32).replace('0x', ''),
        this.toUint256(order.tokenId).replace('0x', ''),
      ].join(''),
      replacementPattern: [
        '00000000',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        '0000000000000000000000000000000000000000000000000000000000000000',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ].join(''),
      staticTarget: '0x0000000000000000000000000000000000000000',
      staticExtra: '0x',
      basePrice: sellOrder.basePrice,
      endPrice: sellOrder.endPrice,
      listingTime: sellOrder.listingTime,
      expirationTime: sellOrder.expirationTime,
      salt: ethers.utils.hexZeroPad(ethers.utils.randomBytes(32), 32),
    } as SolidityOrder;
  }

  async validateOrder(orderId: number, sig: OrderSig) {
    const dbOrder = await this.orderRepository.findOneBy({ id: orderId });

    if (!dbOrder) {
      return false;
    }

    const solidityOrder = JSON.parse(dbOrder.raw) as SolidityOrder;

    if (dbOrder.isSell) {
      const userProxyAddress = await this.getProxyAddress(dbOrder.maker);

      if (userProxyAddress == '0x0000000000000000000000000000000000000000') {
        return false;
      }
      const nftContract = new ethers.Contract(
        dbOrder.contractAddress,
        erc721Abi,
        this.provider,
      );

      if (await nftContract.isApprovedForAll(dbOrder.maker, userProxyAddress)) {
        return false;
      }

      const tokenOwner = await nftContract.ownerOf(dbOrder.tokenId);

      if (BigNumber.from(tokenOwner).eq(BigNumber.from(dbOrder.tokenId))) {
        return false;
      }
    }

    try {
      await this.callVerification(solidityOrder, sig);

      dbOrder.verified = true;
      dbOrder.signature = `${sig.r}${sig.s}${sig.v}`.replace(/0x/g, '');
      await this.orderRepository.save(dbOrder);
    } catch (e) {
      return false;
    }
  }

  async getSellOrders(contract: string, tokenId: string) {
    const nftContract = new ethers.Contract(contract, erc721Abi, this.provider);

    const owner = await nftContract
      .ownerOf(BigNumber.from(tokenId).toHexString())
      .toLowerCase();

    return await this.orderRepository.find({
      where: {
        contractAddress: contract,
        tokenId: this.toUint256(tokenId),
        maker: owner,
        expirationTime: LessThanOrEqual(new Date().getTime()),
        verified: true,
      },
      order: {
        price: 'asc',
      },
    });
  }

  async callVerification(order: SolidityOrder, sig: OrderSig) {
    await this.exchangeContract.validateOrder(
      [
        order.exchange,
        order.maker,
        order.taker,
        order.saleSide,
        order.saleKind,
        order.taker,
        order.paymentToken,
        order.calldata_,
        order.replacementPattern,
        order.staticTarget,
        order.staticExtra,
        order.basePrice,
        order.endPrice,
        order.listingTime,
        order.expirationTime,
        order.salt,
      ],
      [sig.r, sig.s, sig.v],
    );
  }

  async getProxyAddress(address: string) {
    return await this.proxyRegistryContract.proxies(address);
  }

  toUint256(id: string) {
    return ethers.utils.hexZeroPad(BigNumber.from(id).toHexString(), 32);
  }
}
