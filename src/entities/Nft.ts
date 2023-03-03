import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { NftProperty } from './NftProperty';

@Entity()
export class Nft {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  creatorAddress: string;

  @Column()
  contractAddress: string;

  @Column()
  tokenId: string;

  @Column()
  isLazy: boolean;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  image: string;

  @OneToMany((type) => NftProperty, (nftProperty) => nftProperty.nft, {
    cascade: ['insert', 'update'],
  })
  properties: NftProperty[];
}
