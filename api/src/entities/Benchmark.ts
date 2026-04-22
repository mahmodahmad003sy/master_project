import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./User";

export type BenchmarkStatus = "draft" | "running" | "done" | "failed";

@Entity("benchmarks")
export class Benchmark extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Column()
  name!: string;

  @Column({ name: "document_type" })
  documentType!: string;

  @Column({ name: "storage_dir" })
  storageDir!: string;

  @Column({ type: "varchar", default: "draft" })
  status!: BenchmarkStatus;

  @Column({ name: "total_items", type: "int", default: 0 })
  totalItems!: number;

  @Column({ name: "done_items", type: "int", default: 0 })
  doneItems!: number;

  @Column({ name: "failed_items", type: "int", default: 0 })
  failedItems!: number;

  @Column({ name: "summary_path", type: "varchar", nullable: true })
  summaryPath!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
