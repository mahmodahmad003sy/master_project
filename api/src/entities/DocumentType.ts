import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("document_types")
export class DocumentType extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  key!: string;

  @Column()
  name!: string;

  @Column({ type: "json" })
  schema!: Record<string, unknown>;

  @Column({ default: "draft" })
  status!: "draft" | "active" | "archived";

  @Column({ default: 1 })
  version!: number;

  @Column({ name: "detector_model_id", type: "int", nullable: true })
  detectorModelId?: number;

  @Column({ name: "prompt_template", type: "text", nullable: true })
  promptTemplate?: string;

  @Column({ name: "field_config", type: "json", nullable: true })
  fieldConfig?: Record<string, unknown>;

  @Column({ name: "detector_config", type: "json", nullable: true })
  detectorConfig?: {
    classMap: Record<string, string>;
    labelRoles: Record<string, "single" | "arrayContainer" | "arrayChild">;
    groupingRules?: Record<string, unknown>;
  };

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
