import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Public } from '../../common/decorators/public.decorator';
import { successResponse } from '../../common/utils/response.util';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    return successResponse(result, 'Login successful');
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('refresh')
  async refresh(@Req() req: { user: { sub: string } }) {
    const result = await this.authService.refresh(req.user.sub);
    return successResponse(result, 'Token refreshed');
  }
}
