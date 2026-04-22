// src/entities/TestRun.ts
import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ModelFile } from "./ModelFile";

@Entity("test_runs")
export class TestRun extends BaseEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column({ name: "results_path" }) resultsPath!: string;
  @Column({ type: "jsonb" }) metrics!: any;
  @CreateDateColumn({ name: "run_at" }) runAt!: Date;

  @ManyToOne(() => ModelFile, (mf) => mf.testRuns, { onDelete: "CASCADE" })
  @JoinColumn({ name: "model_file_id" })
  modelFile!: ModelFile;
}
