import { IsString } from 'class-validator';

export class WebRtcOfferDto {
  @IsString()
  type!: string;

  @IsString()
  sdp!: string;
}
