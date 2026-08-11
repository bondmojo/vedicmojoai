/**
 * prisma/backfill-owner.ts
 *
 * One-off, idempotent migration (Requirement 6): assigns every UnifiedChart
 * row with userId = null to a single owning User, upserting that User first
 * if one doesn't exist yet for the given email. Safe to re-run — a second
 * run finds no userId: null rows left and is a no-op.
 *
 * Uses $executeRaw for the update: this script is meant to run once, between
 * the "add nullable userId" migration and the "tighten to NOT NULL" migration
 * (see prisma/migrations/*_add_user_management and *_tighten_unified_chart_owner).
 * Once the column is tightened, Prisma's generated types no longer allow
 * `userId: null` in a where clause — raw SQL keeps this script valid on
 * either side of that migration instead of only compiling pre-tighten.
 *
 * Run: npm run db:backfill-owner -- practitioner@example.com
 *   or: BACKFILL_OWNER_EMAIL=practitioner@example.com npm run db:backfill-owner
 */

import { randomBytes } from 'crypto'
import { prisma } from '../lib/db'
import { hashPassword } from '../lib/passwords'

async function main() {
  const email = (process.argv[2] || process.env.BACKFILL_OWNER_EMAIL || '').trim().toLowerCase()
  if (!email) {
    console.error('Usage: npm run db:backfill-owner -- <email>')
    console.error('   or: BACKFILL_OWNER_EMAIL=<email> npm run db:backfill-owner')
    process.exitCode = 1
    return
  }

  let user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    const tempPassword = randomBytes(18).toString('base64url')
    const passwordHash = await hashPassword(tempPassword)
    user = await prisma.user.create({ data: { email, passwordHash } })
    console.log(`Created User ${user.id} for ${email}.`)
    console.log(`Temporary password: ${tempPassword}`)
    console.log('Log in with this once, then change it via "Forgot password".')
  } else {
    console.log(`Using existing User ${user.id} for ${email}.`)
  }

  const updatedCount = await prisma.$executeRaw`
    UPDATE "unified_chart" SET "userId" = ${user.id} WHERE "userId" IS NULL
  `

  if (updatedCount === 0) {
    console.log('No unowned charts remain — nothing to do (idempotent no-op).')
  } else {
    console.log(`Backfilled ${updatedCount} UnifiedChart row(s) to owner ${email}.`)
  }
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
