import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class DimensionScoreInput {
  @IsString()
  @MaxLength(100)
  dimension!: string

  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number

  @IsString()
  @MaxLength(100)
  quality!: string

  @IsString()
  @MaxLength(4000)
  feedback!: string
}

export class CreateResultDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  id!: string

  // Overwritten with the caller's verified id in the controller; body value is ignored.
  userId!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  scenarioId!: string

  @IsString()
  @MaxLength(300)
  scenarioTitle!: string

  @IsString()
  @MaxLength(100)
  track!: string

  @IsISO8601()
  completedAt!: string

  @IsNumber()
  @Min(0)
  @Max(100)
  overallScore!: number

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DimensionScoreInput)
  dimensionScores!: DimensionScoreInput[]

  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  choiceSequence!: string[]
}

export interface DimensionAverage {
  dimension: string
  averageScore: number
}

export interface ResultSummary {
  id: string
  scenarioId: string
  scenarioTitle: string
  track: string
  overallScore: number
  completedAt: string
}

export interface CompetencyProfile {
  dimensionAverages: DimensionAverage[]
  history: ResultSummary[]
}
