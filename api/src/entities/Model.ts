// src/entities/Model.ts
import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { ModelFile } from "./ModelFile";

@Entity("models")
export class Model extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column()
  type!: string;

  // ← existing new filePath column
  @Column({ nullable: true })
  filePath?: string;

  @OneToMany(() => ModelFile, (mf) => mf.model, { cascade: true })
  modelFiles!: ModelFile[];

  // ← new JSON column to store your class map, e.g. { "0": "DATE", "1": "FB", … }
  @Column({ type: "json", nullable: true })
  cocoClasses?: Record<number, string>;

  // ← new JSON column to store your detection/display config, e.g.
  // { "0": { multiple: false, threshold: 0 }, "3": { multiple: true, threshold: 0.5 }, … }
  @Column({ type: "json", nullable: true })
  displayConfig?: Record<
    number,
    { multiple: boolean; threshold: number | null }
  >;

  // ← array of OCR languages, e.g. ["rus"], ["eng","ara"], etc.
  @Column("simple-array", { nullable: true })
  languages?: string[];

  @CreateDateColumn()
  createdAt!: Date;
}
