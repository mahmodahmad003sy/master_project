// src/entities/ModelFile.ts
import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Model } from "./Model";
import { TestRun } from "./TestRun";
import { User } from "./User";

@Entity("model_files")
export class ModelFile extends BaseEntity {
  @PrimaryGeneratedColumn() id!: number;

  // original filename
  @Column() filename!: string;
  // absolute path where this file now lives
  @Column() filePath!: string;
  @Column({ nullable: true }) outputName!: string;

  // link back to the Model
  @ManyToOne(() => Model, (m) => m.modelFiles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "model_id" })
  model!: Model;

  @CreateDateColumn({ name: "uploaded_at" }) uploadedAt!: Date;

  @OneToMany(() => TestRun, (tr) => tr.modelFile, { cascade: true })
  testRuns!: TestRun[];

  @ManyToOne((photo) => User, (user) => user.files, {
    nullable: true,
    cascade: true,
  })
  @JoinColumn({ name: "user_id" })
  user!: User;
}
