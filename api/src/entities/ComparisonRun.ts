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

  @Column({ type: "json", nullable: true })
  timings!: Record<string, number> | null;

  @Column({ type: "varchar", nullable: true })
  recommended!: string | null;

  @Column({ name: "has_ground_truth", default: false })
  hasGroundTruth!: boolean;

  @Column({ type: "json", nullable: true })
  summary!: Record<string, number> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
