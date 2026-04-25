import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("models")
export class Model extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column()
  type!: string;

  @Column({ nullable: true })
  filePath?: string;

  @Column({ default: "yolo" })
  family!: string;

  @Column({ name: "classes_count", type: "int", nullable: true })
  classesCount?: number;

  @Column({ type: "json", nullable: true })
  classMap?: Record<string, string>;

  @Column({ name: "input_image_size", type: "int", nullable: true })
  inputImageSize?: number;

  @Column({ name: "confidence_defaults", type: "json", nullable: true })
  confidenceDefaults?: { default: number; perClass?: Record<string, number> };

  @Column({ name: "document_type_id", type: "int", nullable: true })
  documentTypeId?: number;

  @Column({ default: "uploaded" })
  status!: "uploaded" | "validated" | "active" | "archived";

  @Column({ default: 1 })
  version!: number;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  sha256?: string;

  @Column({ name: "file_size", type: "bigint", nullable: true })
  fileSize?: number;

  @Column({ type: "json", nullable: true })
  cocoClasses?: Record<number, string>;

  @Column({ type: "json", nullable: true })
  displayConfig?: Record<
    number,
    { multiple: boolean; threshold: number | null }
  >;

  @Column("simple-array", { nullable: true })
  languages?: string[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
