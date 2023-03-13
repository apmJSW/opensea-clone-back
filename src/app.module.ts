import { NftContract } from './entities/NftContract';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuthRequest, User, Nft, NftProperty, Order } from './entities';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';
import { MintingController } from './minting/minting.controller';
import { MintingService } from './minting/minting.service';
import { NftController } from './nft/nft.controller';
import { NftService } from './nft/nft.service';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { NftConsumer } from './nft/nft.consumer';
import { OrderService } from './order/order.service';
import { OrderController } from './order/order.controller';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'nft',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule, AuthModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DBNAME'),
        entities: [AuthRequest, User, Nft, NftProperty, NftContract, Order],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([User, Nft, NftProperty, NftContract, Order]),
    AuthModule,
  ],
  controllers: [
    AppController,
    UserController,
    MintingController,
    NftController,
    OrderController,
  ],
  providers: [
    AppService,
    UserService,
    MintingService,
    NftService,
    NftConsumer,
    OrderService,
  ],
})
export class AppModule {}
