import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'your-username' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên đăng nhập' })
  username!: string;

  @ApiProperty({ example: '********' })
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu' })
  password!: string;
}
