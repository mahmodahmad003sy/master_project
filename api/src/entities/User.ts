// src/entities/User.ts
import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { ModelFile } from "./ModelFile";

@Entity("users")
export class User extends BaseEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column({ unique: true }) email!: string;
  @Column() name!: string;
  @Column() password!: string; // hashed

  @CreateDateColumn({ name: "created_at" }) createdAt!: Date;

  @OneToMany(() => ModelFile, (file) => file.user)
  files!: ModelFile[];
}
