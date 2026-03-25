export type PulseConfig = {
  id: string;
  userId: string;
  healthEnabled: boolean;
  mentalEnabled: boolean;
  nutritionEnabled: boolean;
  tasksEnabled: boolean;
  financeEnabled: boolean;
  duplicateRecurringExpensesToTasks: boolean;
  duplicateDebtPaymentsToTasks: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PulseProfile = {
  id: string;
  userId: string;
  heightCm: number | null;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  age: number | null;
  dailyCaloriesGoal: number | null;
  proteinGoal: number | null;
  fatGoal: number | null;
  carbsGoal: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PulseWeightDelta = {
  delta: number;
  tone: 'neutral' | 'success' | 'danger';
} | null;

export type PulseGoalSuggestion = {
  dailyCalories: number;
  protein: number;
  fat: number;
  carbs: number;
  bmi: number;
} | null;

export type PulseHealthDay = {
  id: string;
  userId: string;
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  weightKg: number | null;
  wellbeing: number | null;
  stress: number | null;
  productivity: number | null;
  nutrition: number | null;
  smoking: boolean;
  alcoholLevel: number | null;
  activityLevel: number | null;
  caffeineLevel: number | null;
  comment: string | null;
  todayScore: number;
  pulse7Score: number;
};

export type PulseFood = {
  id: string;
  userId: string | null;
  name: string;
  isDish: boolean;
  defaultGrams: number | null;
  calories: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  isHealthy: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PulseMealItem = {
  sourceFoodId?: string | null;
  name: string;
  grams: number;
  calories: number;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  isHealthy?: boolean;
};

export type PulseMeal = {
  id: string;
  userId: string;
  date: string;
  title: string;
  notes: string | null;
  totalCalories: number;
  totalProtein: number | null;
  totalFat: number | null;
  totalCarbs: number | null;
  nutritionScore: number;
  itemsJson: PulseMealItem[];
  createdAt: string;
  updatedAt: string;
};

export type PulseTaskItem = {
  id: string;
  title: string;
  notes: string | null;
  priority: number;
  tags: string[];
  dueDate: string | null;
  taskType: 'REGULAR' | 'ONE_TIME' | 'HABIT';
  scheduleType: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  daysOfWeek: number[];
  daysOfMonth: number[];
  completedForDate: boolean;
  sourceKey?: string | null;
};

export type PulseTaskGoal = {
  id: string;
  title: string;
  description: string | null;
  progress: number;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PulseFinanceCategory = {
  id: string;
  userId: string;
  name: string;
  limitAmount: number | null;
  createdAt: string;
  updatedAt: string;
  spent?: number;
  percent?: number;
  overBy?: number;
};

export type PulseFinanceEntry = {
  id: string;
  userId: string;
  date: string;
  type: 'EXPENSE' | 'INCOME';
  title: string;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryLimitAmount: number | null;
  notes: string | null;
  recurrenceJson: unknown;
  linkedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PulseSavingsGoal = {
  id: string;
  userId: string;
  title: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string | null;
  itemsJson: { title: string; amount: number }[] | null;
  createdAt: string;
  updatedAt: string;
};

export type PulseDebt = {
  id: string;
  userId: string;
  title: string;
  debtType: string;
  totalAmount: number;
  paidAmount: number;
  interestRate: number | null;
  startedAt: string | null;
  dueDate: string | null;
  paymentDay: number | null;
  paymentAmount: number | null;
  termMonths: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PulseOverview = {
  config: PulseConfig;
  profile: PulseProfile | null;
  weightDelta: PulseWeightDelta;
  today: {
    date: string;
    dayScore: number;
    pulse7Score: number;
    mental7Score: number;
    caloriesConsumed: number;
    caloriesRemaining: number | null;
    tasksDone: number;
    tasksTotal: number;
    tasksPercent: number;
    hasPaymentsToday: boolean;
    todaysExpenses: number;
    todaysIncome: number;
    recommendations: string[];
  };
  nutrition: {
    goal: PulseGoalSuggestion;
    totalCalories: number;
    remainingCalories: number | null;
    score: number;
  };
  tasks: {
    total: number;
    completed: number;
    percent: number;
    productivityScore: number;
  };
  finance: {
    monthIncome: number;
    monthExpenses: number;
    balance: number;
    overLimitCategories: PulseFinanceCategory[];
    upcomingPayments: Array<{ kind: string; title: string; amount: number; date: string }>;
  };
};

export type PulseAnalytics = {
  days: number;
  healthRows: PulseHealthDay[];
  taskSeries: Array<{ date: string; percent: number; completed: number; total: number }>;
  calorieLine: Array<{ date: string; calories: number; target: number | null }>;
  weightLine: Array<{ date: string; value: number | null }>;
  habitStreaks: Array<{ id: string; title: string; streak: number }>;
  suggestions: string[];
};
