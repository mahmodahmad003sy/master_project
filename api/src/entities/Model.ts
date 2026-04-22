import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
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
}
