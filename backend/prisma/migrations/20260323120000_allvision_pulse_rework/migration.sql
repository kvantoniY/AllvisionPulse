-- CreateEnum
CREATE TYPE "FinanceEntryType" AS ENUM ('EXPENSE', 'INCOME');

-- AlterTable
ALTER TABLE "HealthDay"
  ADD COLUMN "weightKg" DOUBLE PRECISION,
  ADD COLUMN "alcoholLevel" INTEGER,
  ADD COLUMN "activityLevel" INTEGER,
  ADD COLUMN "caffeineLevel" INTEGER;

ALTER TABLE "Task"
  ADD COLUMN "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "PulseProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "startWeightKg" DOUBLE PRECISION,
    "currentWeightKg" DOUBLE PRECISION,
    "targetWeightKg" DOUBLE PRECISION,
    "age" INTEGER,
    "dailyCaloriesGoal" INTEGER,
    "proteinGoal" DOUBLE PRECISION,
    "fatGoal" DOUBLE PRECISION,
    "carbsGoal" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "healthEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mentalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nutritionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "financeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "duplicateRecurringExpensesToTasks" BOOLEAN NOT NULL DEFAULT true,
    "duplicateDebtPaymentsToTasks" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseFood" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "isDish" BOOLEAN NOT NULL DEFAULT false,
    "defaultGrams" DOUBLE PRECISION,
    "calories" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "isHealthy" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseFood_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseMeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "totalCalories" INTEGER NOT NULL DEFAULT 0,
    "totalProtein" DOUBLE PRECISION,
    "totalFat" DOUBLE PRECISION,
    "totalCarbs" DOUBLE PRECISION,
    "nutritionScore" INTEGER NOT NULL DEFAULT 0,
    "itemsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseMeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseTaskCompletion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseTaskCompletion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseFinanceCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limitAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseFinanceCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseFinanceEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "FinanceEntryType" NOT NULL DEFAULT 'EXPENSE',
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "categoryId" TEXT,
    "notes" TEXT,
    "recurrenceJson" JSONB,
    "linkedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseFinanceEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseSavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetAmount" DOUBLE PRECISION NOT NULL,
    "savedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "itemsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseSavingsGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseDebt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "debtType" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestRate" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paymentDay" INTEGER,
    "paymentAmount" DOUBLE PRECISION,
    "termMonths" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseDebt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PulseGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PulseProfile_userId_key" ON "PulseProfile"("userId");
CREATE UNIQUE INDEX "PulseConfig_userId_key" ON "PulseConfig"("userId");
CREATE INDEX "PulseFood_name_idx" ON "PulseFood"("name");
CREATE INDEX "PulseFood_userId_createdAt_idx" ON "PulseFood"("userId", "createdAt");
CREATE INDEX "PulseMeal_userId_date_idx" ON "PulseMeal"("userId", "date");
CREATE UNIQUE INDEX "PulseTaskCompletion_taskId_date_key" ON "PulseTaskCompletion"("taskId", "date");
CREATE INDEX "PulseTaskCompletion_userId_date_idx" ON "PulseTaskCompletion"("userId", "date");
CREATE UNIQUE INDEX "PulseFinanceCategory_userId_name_key" ON "PulseFinanceCategory"("userId", "name");
CREATE INDEX "PulseFinanceCategory_userId_createdAt_idx" ON "PulseFinanceCategory"("userId", "createdAt");
CREATE INDEX "PulseFinanceEntry_userId_date_idx" ON "PulseFinanceEntry"("userId", "date");
CREATE INDEX "PulseSavingsGoal_userId_createdAt_idx" ON "PulseSavingsGoal"("userId", "createdAt");
CREATE INDEX "PulseDebt_userId_createdAt_idx" ON "PulseDebt"("userId", "createdAt");
CREATE INDEX "PulseGoal_userId_createdAt_idx" ON "PulseGoal"("userId", "createdAt");
CREATE INDEX "Task_userId_sourceKey_idx" ON "Task"("userId", "sourceKey");

-- AddForeignKey
ALTER TABLE "PulseProfile" ADD CONSTRAINT "PulseProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseConfig" ADD CONSTRAINT "PulseConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseFood" ADD CONSTRAINT "PulseFood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PulseMeal" ADD CONSTRAINT "PulseMeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseTaskCompletion" ADD CONSTRAINT "PulseTaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseTaskCompletion" ADD CONSTRAINT "PulseTaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseFinanceCategory" ADD CONSTRAINT "PulseFinanceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseFinanceEntry" ADD CONSTRAINT "PulseFinanceEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseFinanceEntry" ADD CONSTRAINT "PulseFinanceEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PulseFinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PulseSavingsGoal" ADD CONSTRAINT "PulseSavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseDebt" ADD CONSTRAINT "PulseDebt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PulseGoal" ADD CONSTRAINT "PulseGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
