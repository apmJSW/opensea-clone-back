import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthRequest, User } from '../entities';
import { Repository } from 'typeorm';
import { v4 } from 'uuid';
import { ethers } from 'ethers';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AuthRequest)
    private authRequestRepository: Repository<AuthRequest>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async generateAuthRequest(address: string) {
    const authRequest = new AuthRequest();

    authRequest.address = address;
    authRequest.nonce = v4();
    authRequest.expiredAt = new Date(new Date().getTime() + 10 * 60 * 1000);

    return await this.authRequestRepository.save(authRequest);
  }

  generateSignatureMessage(authRequest: AuthRequest) {
    return `Welcome to OpenSea!

Click to sign in and accept the OpenSea Terms of Service: https://opensea.io/tos
    
This request will not trigger a blockchain transaction or cost any gas fees.
    
Your authentication status will reset after 24 hours.
    
Wallet address:
${authRequest.address}
    
Nonce:
${authRequest.nonce}`;
  }

  async verifyAuthRequest(id: number, signature: string) {
    const authRequest = await this.authRequestRepository.findOne({
      where: { id, verified: false },
    });

    if (!authRequest) {
      throw new HttpException('auth not found', HttpStatus.BAD_REQUEST);
    }

    if (authRequest.expiredAt?.getTime() < new Date().getTime()) {
      throw new HttpException('expired', HttpStatus.BAD_REQUEST);
    }

    try {
      ethers.utils.verifyMessage(
        this.generateSignatureMessage(authRequest),
        signature,
      );
    } catch (error) {
      if (error.code === 'INVALID_ARGUMENT') {
        throw new HttpException('invalid', HttpStatus.UNAUTHORIZED);
      }
    }

    authRequest.verified = true;
    await this.authRequestRepository.save(authRequest);

    let user = await this.userRepository.findOne({
      where: { address: authRequest.address },
    });
    if (!user) {
      user = new User();
      user.address = authRequest.address;
      user = await this.userRepository.save(user);
    }

    return {
      accessToken: this.jwtService.sign({
        sub: user.id,
        address: user.address,
      }),
    };
  }
}
