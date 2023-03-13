import { Body, Controller, Get, Post, Param } from '@nestjs/common';
import { OrderService } from './order.service';

@Controller('order')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Get('/proxy/:address')
  async getProxyAddress(@Param() param) {
    const { address } = param;
    return {
      proxy: await this.orderService.getProxyAddress(address),
    };
  }

  @Get('/sell/:address/:tokenId')
  async getSellOrders(@Param() param) {
    const { address, tokenId } = param;

    return await this.orderService.getSellOrders(address, tokenId);
  }

  @Post('/sell')
  async generateSellOrder(@Body() body) {
    const { maker, contract, tokenId, price, expirationTime } = body;

    return await this.orderService.generateSellOrder({
      maker,
      contract,
      tokenId,
      price,
      expirationTime,
    });
  }

  @Post('/buy')
  async generateBuyOrder(@Body() body) {
    const { orderId, maker } = body;

    return this.orderService.generateBuyOrderFromFixedPriceSell(orderId, maker);
  }

  @Post('/verify')
  async verifyBuyOrder(@Body() body) {
    const { order, sig } = body;

    try {
      await this.orderService.callVerification(order, sig);
      return true;
    } catch (e) {
      return false;
    }
  }

  @Post('/sell/verify')
  verifySellOrder(@Body() body) {
    const { orderId, sig } = body;
    return this.orderService.validateOrder(orderId, sig);
  }
}
