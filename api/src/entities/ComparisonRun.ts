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

@Entity("comparison_runs")
export class ComparisonRun extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Column()
  filename!: string;

  @Column({ name: "storage_dir" })
  storageDir!: string;

  @Column({ name: "image_name" })
  imageName!: string;

  @Column({ name: "image_w", type: "int", nullable: true })
  imageW!: number | null;

  @Column({ name: "image_h", type: "int", nullable: true })
  imageH!: number | null;

  @Column({ type: "varchar", nullable: true })
  device!: string | null;

  @Column({ name: "document_type" })
  documentType!: string;

  @Column({ name: "document_type_version", type: "int", nullable: true })
  documentTypeVersion?: number;

  @Column({ name: "detector_model_id", type: "int", nullable: true })
  detectorModelId?: number;

  @Column({ name: "detector_model_version", type: "int", nullable: true })
  detectorModelVersion?: number;

  @Column({ name: "prompt_version", type: "int", nullable: true })
  promptVersion?: number;

  @Column({ type: "json", nullable: true })
  timings!: Record<string, number> | null;

  @Column({ type: "varchar", nullable: true })
  recommended!: string | null;

  @Column({ name: "benchmark_id", type: "int", nullable: true })
  benchmarkId!: number | null;

  @Column({ name: "has_ground_truth", default: false })
  hasGroundTruth!: boolean;

  @Column({ type: "json", nullable: true })
  summary!: Record<string, number> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
