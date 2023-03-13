import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'mediumtext' })
  raw: string;

  @Column()
  isSell: boolean;

  @Column()
  signature: string;

  @Column()
  maker: string;

  @Column()
  price: string;

  @Column()
  contractAddress: string;

  @Column()
  tokenId: string;

  @Column()
  expirationTime: number;

  @Column()
  verified: boolean;
}
