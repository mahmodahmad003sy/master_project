import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
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

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
