import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

type TwitchReward = Record<string, unknown>;

@Injectable()
export class PointPoolService {
    private readonly logger = new Logger(PointPoolService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(name: string) {
        return this.prisma.pointPoolEvent.create({
            data: { name },
        });
    }

    async findAll() {
        return this.prisma.pointPoolEvent.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { redemptions: true } },
            },
        });
    }

    async findOne(id: string) {
        const event = await this.prisma.pointPoolEvent.findUnique({
            where: { id },
        });

        if (!event) {
            throw new NotFoundException('Point pool event not found');
        }

        return event;
    }

    async start(id: string) {
        const event = await this.findOne(id);

        if (event.status === 'COMPLETED') {
            throw new ConflictException('A completed point pool cannot be restarted');
        }

        const activeEvent = await this.prisma.pointPoolEvent.findFirst({
            where: { status: 'ACTIVE' },
        });

        if (activeEvent && activeEvent.id !== id) {
            throw new ConflictException(
                `Another point pool is already active: ${activeEvent.name}`,
            );
        }

        if (event.status === 'ACTIVE') {
            return event;
        }

        return this.prisma.pointPoolEvent.update({
            where: { id },
            data: {
                status: 'ACTIVE',
                startedAt: new Date(),
                endedAt: null,
            },
        });
    }

    async finish(id: string) {
        const event = await this.findOne(id);

        if (event.status !== 'ACTIVE') {
            throw new ConflictException('Only an active point pool can be finished');
        }

        return this.prisma.pointPoolEvent.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                endedAt: new Date(),
            },
        });
    }

    async getSummary(id: string) {
        const event = await this.findOne(id);

        const aggregate = await this.prisma.pointPoolRedemption.aggregate({
            where: { pointPoolEventId: id },
            _sum: { pointsCost: true },
            _count: { _all: true },
        });

        return {
            event,
            totalPoints: aggregate._sum.pointsCost ?? 0,
            redemptionCount: aggregate._count._all,
        };
    }

    async getRedemptions(id: string) {
        await this.findOne(id);

        return this.prisma.pointPoolRedemption.findMany({
            where: { pointPoolEventId: id },
            orderBy: { redeemedAt: 'desc' },
            take: 100,
        });
    }

    private async findActivePool() {
        const pool = await this.prisma.pointPoolEvent.findFirst({
            where: { status: 'ACTIVE' },
            orderBy: { startedAt: 'desc' },
        });

        if (!pool) {
            throw new NotFoundException('There is no active point pool');
        }

        return pool;
    }

    private async calculateTotalPoints(pointPoolEventId: string) {
        const [redemptions, adjustments] = await Promise.all([
            this.prisma.pointPoolRedemption.aggregate({
                where: { pointPoolEventId },
                _sum: { pointsCost: true },
            }),
            this.prisma.pointPoolAdjustment.aggregate({
                where: { pointPoolEventId },
                _sum: { amount: true },
            }),
        ]);

        return (
            (redemptions._sum.pointsCost ?? 0) +
            (adjustments._sum.amount ?? 0)
        );
    }

    async startByName(name: string) {
        let event = await this.prisma.pointPoolEvent.findFirst({
            where: { name },
            orderBy: { createdAt: 'asc' },
        });

        if (!event) {
            event = await this.create(name);
        }

        return this.start(event.id);
    }

    async finishByName(name: string) {
        const event = await this.prisma.pointPoolEvent.findFirst({
            where: { name, status: 'ACTIVE' },
        });

        if (!event) {
            throw new NotFoundException(
                `No active point pool named "${name}"`,
            );
        }

        return this.finish(event.id);
    }

    async getActiveRank() {
        const pool = await this.findActivePool();

        const rankings = await this.prisma.pointPoolRedemption.groupBy({
            by: ['userId', 'userLogin', 'userDisplayName'],
            where: { pointPoolEventId: pool.id },
            _sum: { pointsCost: true },
            orderBy: { _sum: { pointsCost: 'desc' } },
            take: 3,
        });

        return rankings.map((entry, index) => ({
            rank: index + 1,
            userId: entry.userId,
            login: entry.userLogin,
            displayName: entry.userDisplayName,
            points: entry._sum.pointsCost ?? 0,
        }));
    }

    async getActiveGoals() {
        const pool = await this.findActivePool();

        const [goals, totalPoints] = await Promise.all([
            this.prisma.pointPoolGoal.findMany({
                where: { pointPoolEventId: pool.id },
                orderBy: { createdAt: 'asc' },
            }),
            this.calculateTotalPoints(pool.id),
        ]);

        return { pool, totalPoints, goals };
    }

    async addGoal(targetPoints: number, description: string) {
        const pool = await this.findActivePool();

        if (!Number.isSafeInteger(targetPoints) || targetPoints <= 0) {
            throw new ConflictException(
                'Goal target must be a positive whole number',
            );
        }

        const cleanDescription = description.trim();

        if (!cleanDescription) {
            throw new ConflictException('Goal description is required');
        }

        return this.prisma.pointPoolGoal.create({
            data: {
                targetPoints,
                description: cleanDescription,
                pointPoolEventId: pool.id,
            },
        });
    }

    async removeGoal(idPrefix: string) {
        const pool = await this.findActivePool();

        if (!idPrefix || idPrefix.length < 4) {
            throw new ConflictException(
                'Please provide at least 4 characters of the goal ID',
            );
        }

        const goals = await this.prisma.pointPoolGoal.findMany({
            where: { pointPoolEventId: pool.id },
            orderBy: { createdAt: 'asc' },
        });

        const matches = goals.filter((goal) =>
            goal.id.startsWith(idPrefix),
        );

        if (matches.length !== 1) {
            throw new NotFoundException(
                'Goal not found or ID prefix is ambiguous. Check !pointgoal first.',
            );
        }

        return this.prisma.pointPoolGoal.delete({
            where: { id: matches[0].id },
        });
    }

    async adjustPoints(amount: number, reason?: string) {
        const pool = await this.findActivePool();

        if (!Number.isSafeInteger(amount) || amount === 0) {
            throw new ConflictException(
                'Adjustment must be a non-zero whole number',
            );
        }

        const currentTotal = await this.calculateTotalPoints(pool.id);

        if (currentTotal + amount < 0) {
            throw new ConflictException(
                `Cannot remove more than the current total of ${currentTotal} points`,
            );
        }

        const adjustment = await this.prisma.pointPoolAdjustment.create({
            data: {
                amount,
                attribution: 'GreedyKAITO',
                reason: reason?.trim() || null,
                pointPoolEventId: pool.id,
            },
        });

        return {
            adjustment,
            totalPoints: currentTotal + amount,
        };
    }

    async getActiveProgress() {
        const pool = await this.prisma.pointPoolEvent.findFirst({
            where: { status: 'ACTIVE' },
            orderBy: { startedAt: 'desc' },
        });

        if (!pool) {
            return {
                pool: null,
                totalPoints: 0,
                goals: [],
            };
        }

        const [totalPoints, goals] = await Promise.all([
            this.calculateTotalPoints(pool.id),
            this.prisma.pointPoolGoal.findMany({
                where: { pointPoolEventId: pool.id },
                orderBy: { targetPoints: 'asc' },
            }),
        ]);

        return { pool, totalPoints, goals };
    }

    async recordRedemption(event: Record<string, unknown>) {
        const redemptionId = event.id;
        const userId = event.user_id;
        const userLogin = event.user_login;
        const userDisplayName = event.user_name;
        const redeemedAt = event.redeemed_at;
        const reward = event.reward as TwitchReward | undefined;

        if (
            typeof redemptionId !== 'string' ||
            typeof userId !== 'string' ||
            typeof userLogin !== 'string' ||
            typeof userDisplayName !== 'string' ||
            typeof redeemedAt !== 'string' ||
            !reward ||
            typeof reward.id !== 'string' ||
            typeof reward.title !== 'string' ||
            typeof reward.cost !== 'number' ||
            !Number.isInteger(reward.cost) ||
            reward.cost < 0
        ) {
            this.logger.warn('Ignoring malformed Twitch channel-point redemption');
            return { recorded: false, reason: 'invalid_payload' };
        }

        const redeemedAtDate = new Date(redeemedAt);

        if (Number.isNaN(redeemedAtDate.getTime())) {
            this.logger.warn('Ignoring redemption with an invalid timestamp');
            return { recorded: false, reason: 'invalid_timestamp' };
        }

        const pool = await this.prisma.pointPoolEvent.findFirst({
            where: { status: 'ACTIVE' },
            orderBy: { startedAt: 'desc' },
        });

        if (!pool) {
            return { recorded: false, reason: 'no_active_pool' };
        }

        // Handle the unique-key conflict directly because this database provider
        // does not support createMany's skipDuplicates option.
        let redemption;
        try {
            redemption = await this.prisma.pointPoolRedemption.create({
                data: {
                twitchRedemptionId: redemptionId,
                userId,
                userLogin,
                userDisplayName,
                rewardId: reward.id,
                rewardTitle: reward.title,
                pointsCost: reward.cost,
                redeemedAt: redeemedAtDate,
                pointPoolEventId: pool.id,
                },
            });
        } catch (error: unknown) {
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === 'P2002'
            ) {
            this.logger.debug(`Ignoring duplicate redemption ${redemptionId}`);
            return { recorded: false, reason: 'duplicate' };
            }

            throw error;
        }

        this.logger.log(
            `Recorded ${reward.cost} points from ${userDisplayName} for pool "${pool.name}"`,
        );

        return { recorded: true, pointPoolEventId: pool.id };
    }
}