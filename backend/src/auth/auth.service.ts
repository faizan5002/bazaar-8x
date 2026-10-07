import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { SellersService, SellerSummary } from '../sellers/sellers.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

/** The signed-in user as the frontend sees them. `seller` is set when they own a seller account (public fields only). */
export interface AuthUserView {
  id: number;
  email: string;
  name: string;
  seller: SellerSummary | null;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUserView;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly sellers: SellersService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({ email: dto.email, name: dto.name, passwordHash });
    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    // Same error for unknown email and wrong password to avoid account enumeration.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user);
  }

  async me(userId: number): Promise<AuthUserView> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.toView(user);
  }

  private async toView(user: User): Promise<AuthUserView> {
    const seller = await this.sellers.findByOwner(user.id);
    return { id: user.id, email: user.email, name: user.name, seller: seller ? this.sellers.toSummary(seller) : null };
  }

  private async issueToken(user: User): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { accessToken, user: await this.toView(user) };
  }
}
