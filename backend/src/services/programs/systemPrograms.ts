import { prisma } from "../../db/prisma";
import { toPrismaNullableJson } from "./helpers";

type SystemProgramSpec = {
  title: string;
  description: string;
  category: string;
  theme: string;
  durationDays: number;
  structureType: "FIXED_DURATION" | "ROLLING" | "OPEN_ENDED";
  collaborativeEnabled: boolean;
  rules: {
    allowSkip?: boolean;
    allowPause?: boolean;
    allowResume?: boolean;
    allowCancel?: boolean;
    allowRecovery?: boolean;
    maxReschedulesPerAction?: number;
    recoveryConfigJson?: Record<string, unknown> | null;
    progressConfigJson?: Record<string, unknown> | null;
    integrationConfigJson?: Record<string, unknown> | null;
  };
  stages: Array<{
    title: string;
    description: string;
    startDay: number;
    endDay: number;
    milestoneText?: string | null;
  }>;
  days: Array<{
    dayNumber: number;
    title?: string | null;
    dayText?: string | null;
    tipOfDay?: string | null;
    motivationOfDay?: string | null;
    reflectionPrompt?: string | null;
    actions: Array<{
      order: number;
      actionType: string;
      integrationType?: string | null;
      title: string;
      description?: string | null;
      required?: boolean;
      estimatedMinutes?: number | null;
      completionPolicy?: string | null;
      reschedulePolicy?: string | null;
      payloadJson?: Record<string, unknown> | null;
    }>;
    milestones?: Array<{
      order: number;
      title: string;
      description?: string | null;
      targetDay?: number | null;
      metricKey?: string | null;
      payloadJson?: Record<string, unknown> | null;
    }>;
  }>;
};

function workoutByWeightPayload() {
  return {
    byWeightKg: [
      {
        maxWeight: 69,
        title: "Лёгкая кардио-силовая сессия",
        recommendation: "20 минут быстрой ходьбы и 2 круга базовых упражнений без отказа.",
      },
      {
        minWeight: 70,
        maxWeight: 95,
        title: "Базовая жиросжигающая тренировка",
        recommendation: "30 минут ходьбы и 3 круга: приседания, тяга резиной, планка, выпады.",
      },
      {
        minWeight: 96,
        title: "Щадящая тренировка с акцентом на шаги",
        recommendation: "40 минут ходьбы в комфортном темпе, мобилизация и короткий круг без ударной нагрузки.",
      },
    ],
  };
}

function buildQuitSmokingProgram(): SystemProgramSpec {
  const cravingTips = [
    "Первые минуты тяги проходят быстрее, если занять руки и выпить воды.",
    "Не спорьте с собой весь день. Дайте себе задачу не курить только до вечера.",
    "Сильная тяга чаще всего пиковая лишь несколько минут. Переключитесь на ходьбу или дыхание.",
    "Если сорвались, не отменяйте всю программу. Вернитесь к следующему действию дня.",
  ];

  const days = Array.from({ length: 21 }, (_, index) => {
    const dayNumber = index + 1;
    const actionList = [
      {
        order: 0,
        actionType: "HEALTH_CHECKIN",
        integrationType: "HEALTH",
        title: "Отметить тягу и самочувствие",
        description: "Коротко оцените тягу к сигаретам, уровень стресса и общее состояние.",
        required: true,
        estimatedMinutes: 3,
        payloadJson: {
          track: ["stress", "wellbeing", "smoking"],
          cravingScale: true,
        },
      },
      {
        order: 1,
        actionType: "TASK",
        integrationType: "TASK_TRACKER",
        title: "Подготовить замену сигарете",
        description: "Вода, жвачка, прогулка, дыхание или сообщение другу вместо сигареты.",
        required: true,
        estimatedMinutes: 5,
        payloadJson: {
          alternatives: ["вода", "жвачка", "прогулка", "дыхание 4-4-6"],
        },
      },
      {
        order: 2,
        actionType: "REFLECTION",
        integrationType: "JOURNAL",
        title: "Записать, когда хотелось закурить",
        description: "Одной фразой: что было триггером и что помогло не сорваться.",
        required: false,
        estimatedMinutes: 4,
      },
    ] as SystemProgramSpec["days"][number]["actions"];

    if (dayNumber === 1) {
      actionList.unshift({
        order: -1,
        actionType: "TASK",
        integrationType: "TASK_TRACKER",
        title: "Убрать сигареты и триггеры",
        description: "Спрячьте или выбросьте сигареты, зажигалки и всё, что напоминает о ритуале.",
        required: true,
        estimatedMinutes: 10,
      });
    }

    if ([3, 7, 14, 21].includes(dayNumber)) {
      actionList.push({
        order: 3,
        actionType: "MILESTONE",
        integrationType: "NONE",
        title: dayNumber === 21 ? "Три недели без сигарет" : `Рубеж дня ${dayNumber}`,
        description: dayNumber === 21 ? "Организм уже успел перестроиться. Важно удержать новый ритм." : "Отметьте, как меняется тяга, сон и энергия.",
        required: false,
        estimatedMinutes: 2,
      });
    }

    return {
      dayNumber,
      title: dayNumber === 1 ? "Старт без сигарет" : dayNumber === 7 ? "Неделя устойчивости" : dayNumber === 14 ? "Проверка привычки" : null,
      dayText:
        dayNumber === 1
          ? "Сегодня не нужно побеждать всю жизнь сразу. Нужен только один чистый день и понятная замена старому ритуалу."
          : dayNumber === 7
            ? "Тяга может возвращаться волнами. Это не откат, а часть перестройки. Смотрите на день, а не на всю дистанцию."
            : dayNumber === 14
              ? "Новые бытовые привычки уже важнее силы воли. Оставьте ритм простым и повторяемым."
              : dayNumber === 21
                ? "Вы уже построили основу. Дальше важно не героически терпеть, а поддерживать новый образ дня."
                : "Главная задача дня: пройти его без автоматического возврата к старому сценарию.",
      tipOfDay: cravingTips[index % cravingTips.length],
      motivationOfDay:
        dayNumber <= 5
          ? "Сегодня победа измеряется не идеальностью, а тем, что вы не сдались на первом импульсе."
          : dayNumber <= 14
            ? "Каждый чистый день ослабляет старую связку между стрессом и сигаретой."
            : "Вы уже не начинаете с нуля. У вас есть накопленный ритм, который работает в вашу пользу.",
      reflectionPrompt: "Что сегодня было самым сложным триггером и что сработало лучше всего?",
      actions: actionList,
      milestones:
        [7, 14, 21].includes(dayNumber)
          ? [
              {
                order: 0,
                title: dayNumber === 21 ? "Закрепление отказа от курения" : `День ${dayNumber} без сигарет`,
                description: "Промежуточный результат в программе отказа от курения.",
                targetDay: dayNumber,
                metricKey: "smoke_free_days",
              },
            ]
          : [],
    };
  });

  return {
    title: "Программа отказа от курения",
    description: "Мягкая программа от сайта с ежедневными check-in, действиями против триггеров, поддерживающими текстами и recovery без ощущения провала.",
    category: "Привычки",
    theme: "Отказ от курения",
    durationDays: 21,
    structureType: "FIXED_DURATION",
    collaborativeEnabled: true,
    rules: {
      allowSkip: true,
      allowPause: true,
      allowResume: true,
      allowCancel: true,
      allowRecovery: true,
      maxReschedulesPerAction: 2,
      recoveryConfigJson: {
        allowSoftCatchUp: true,
        allowRecoveryDay: true,
        allowShiftForward: true,
      },
    },
    stages: [
      { title: "Старт", description: "Снимаем триггеры и собираем базовую поддержку.", startDay: 1, endDay: 3, milestoneText: "Первый чистый цикл" },
      { title: "Стабилизация", description: "Держим ритм и учимся проживать тягу без сигареты.", startDay: 4, endDay: 10, milestoneText: "Неделя устойчивости" },
      { title: "Закрепление", description: "Поддерживаем новый сценарий дня и не драматизируем откаты.", startDay: 11, endDay: 21, milestoneText: "Новая привычка сильнее старой" },
    ],
    days,
  };
}

function buildWeightLossProgram(): SystemProgramSpec {
  const nutritionTips = [
    "Соберите тарелку вокруг белка и овощей, а не вокруг случайного перекуса.",
    "Не пытайтесь урезать всё сразу. Стабильный дефицит лучше жёсткого рывка на два дня.",
    "Если день сорвался, вернитесь к следующему приёму пищи, а не к понедельнику.",
    "Движение помогает не только расходу, но и снижению импульсивного аппетита.",
  ];

  const days = Array.from({ length: 28 }, (_, index) => {
    const dayNumber = index + 1;
    const workoutDay = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26].includes(dayNumber);
    const reviewDay = [7, 14, 21, 28].includes(dayNumber);

    const actions = [
      {
        order: 0,
        actionType: "NUTRITION_TARGET",
        integrationType: "NUTRITION",
        title: "Удержать дневную цель по питанию",
        description: "Следуем базовому плану по калориям и БЖУ без перегруза деталями.",
        required: true,
        estimatedMinutes: 5,
        payloadJson: {
          calories: 1800,
          protein: 130,
          fat: 60,
          carbs: 170,
          hydrationMl: 2000,
          nutritionRecommendations: [
            "Белок в каждом основном приёме пищи",
            "Овощи минимум 2 раза в день",
            "Сладкое не натощак",
          ],
        },
      },
      {
        order: 1,
        actionType: "TASK",
        integrationType: "TASK_TRACKER",
        title: "Закрыть цель по шагам",
        description: "Минимум 8000 шагов в комфортном темпе.",
        required: true,
        estimatedMinutes: 45,
        payloadJson: {
          targetSteps: 8000,
        },
      },
      {
        order: 2,
        actionType: workoutDay ? "TASK" : "INFO_ONLY",
        integrationType: workoutDay ? "TASK_TRACKER" : "NONE",
        title: workoutDay ? "Выполнить тренировку дня" : "День без тяжёлой тренировки",
        description: workoutDay
          ? "План тренировки адаптируется под вес пользователя и помогает держать дефицит без перегруза."
          : "Сегодня фокус на шагах, питании и восстановлении.",
        required: workoutDay,
        estimatedMinutes: workoutDay ? 30 : 3,
        payloadJson: workoutDay ? workoutByWeightPayload() : null,
      },
      {
        order: 3,
        actionType: reviewDay ? "HEALTH_CHECKIN" : "INFO_ONLY",
        integrationType: reviewDay ? "HEALTH" : "NONE",
        title: reviewDay ? "Контроль веса и самочувствия" : "Подсказка дня",
        description: reviewDay
          ? "Отметьте вес, сон и общее самочувствие, чтобы программа мягко корректировалась."
          : "Напомните себе, что важнее стабильность, чем идеальный день.",
        required: reviewDay,
        estimatedMinutes: reviewDay ? 5 : 2,
      },
      {
        order: 4,
        actionType: "REFLECTION",
        integrationType: "JOURNAL",
        title: "Короткая вечерняя заметка",
        description: "Что сегодня помогло удержаться в ритме, а что хочется упростить завтра.",
        required: false,
        estimatedMinutes: 4,
      },
    ] as SystemProgramSpec["days"][number]["actions"];

    return {
      dayNumber,
      title:
        dayNumber === 1
          ? "Мягкий старт"
          : dayNumber === 7
            ? "Первая проверка"
            : dayNumber === 14
              ? "Удержать темп"
              : dayNumber === 21
                ? "Новая рутина"
                : dayNumber === 28
                  ? "Финиш цикла"
                  : null,
      dayText:
        dayNumber === 1
          ? "Цель первой недели не в идеальности, а в понятном ритме: еда, шаги, сон и короткие тренировки."
          : dayNumber === 14
            ? "На второй неделе привычки важнее мотивационного всплеска. Упростите всё, что мешает повторяемости."
            : dayNumber === 28
              ? "Финиш цикла нужен не ради галочки, а чтобы увидеть, какие действия реально работают именно для вас."
              : "Сегодня работаем на спокойный, устойчивый дефицит и понятный режим без перегруза цифрами.",
      tipOfDay: nutritionTips[index % nutritionTips.length],
      motivationOfDay:
        workoutDay
          ? "Нужна не идеальная тренировка, а очередное подтверждение, что вы держите курс."
          : "Даже спокойный день двигает результат, если питание и ритм остаются под контролем.",
      reflectionPrompt: "Что сегодня проще всего сохранить в завтрашнем дне?",
      actions,
      milestones:
        reviewDay
          ? [
              {
                order: 0,
                title: dayNumber === 28 ? "Первый цикл снижения веса завершён" : `Контрольная точка недели ${dayNumber / 7}`,
                description: "Промежуточная фиксация результата в программе похудения.",
                targetDay: dayNumber,
                metricKey: "weight_loss_cycle",
              },
            ]
          : [],
    };
  });

  return {
    title: "Программа похудения",
    description: "Системная программа от сайта: цель по калориям и БЖУ, упражнения по весу, рекомендации по питанию, мотивация без перегруза и мягкий recovery после пропусков.",
    category: "Вес",
    theme: "Похудение",
    durationDays: 28,
    structureType: "FIXED_DURATION",
    collaborativeEnabled: true,
    rules: {
      allowSkip: true,
      allowPause: true,
      allowResume: true,
      allowCancel: true,
      allowRecovery: true,
      maxReschedulesPerAction: 3,
      recoveryConfigJson: {
        allowSoftCatchUp: true,
        allowRecoveryDay: true,
        allowShiftForward: true,
      },
      integrationConfigJson: {
        nutrition: true,
        tasks: true,
        healthCheckins: true,
      },
    },
    stages: [
      { title: "Вход в ритм", description: "Собираем базовый режим: питание, шаги и короткие тренировки.", startDay: 1, endDay: 7, milestoneText: "Первые устойчивые 7 дней" },
      { title: "Стабилизация", description: "Закрепляем повторы и уменьшаем перегруз решением за решение.", startDay: 8, endDay: 21, milestoneText: "Режим стал предсказуемым" },
      { title: "Финиш цикла", description: "Смотрим на динамику веса и переносим рабочие элементы дальше.", startDay: 22, endDay: 28, milestoneText: "Цикл завершён без рывков и откатов" },
    ],
    days,
  };
}

function buildEnglishProgram(): SystemProgramSpec {
  const weeklyThemes = [
    "Базовый словарь и короткое чтение",
    "Понимание речи и закрепление",
    "Разговорные шаблоны и повторение",
  ];

  const days = Array.from({ length: 21 }, (_, index) => {
    const dayNumber = index + 1;
    const reviewDay = [7, 14, 21].includes(dayNumber);
    const listeningDay = [2, 4, 6, 9, 11, 13, 16, 18, 20].includes(dayNumber);

    return {
      dayNumber,
      title: reviewDay ? `Недельный обзор ${Math.ceil(dayNumber / 7)}` : null,
      dayText: reviewDay
        ? "Сегодня не нужно набирать новый объём. Лучше спокойно собрать, что уже закрепилось: слова, фразы и ощущение ритма."
        : "Идея дня простая: немного слов, немного чтения, немного понимания на слух. Регулярность важнее длинных редких рывков.",
      tipOfDay: listeningDay
        ? "Слушайте один короткий фрагмент 2-3 раза: сначала смысл, потом знакомые фразы."
        : "Новый словарь лучше закрепляется, если сразу вставить 2-3 слова в собственные фразы.",
      motivationOfDay: reviewDay
        ? "Вы строите не список выученных слов, а устойчивую привычку ежедневно входить в язык."
        : "Даже 15 спокойных минут английского каждый день сильнее случайного вдохновения раз в неделю.",
      reflectionPrompt: "Что сегодня было проще всего понять, а где ещё хочется снизить сложность?",
      actions: [
        {
          order: 0,
          actionType: "TASK",
          integrationType: "TASK_TRACKER",
          title: "Разобрать 10 новых слов или фраз",
          description: "Не больше 10, чтобы реально успеть повторить и использовать их сегодня же.",
          required: true,
          estimatedMinutes: 12,
          payloadJson: {
            vocabularyTarget: 10,
            weeklyTheme: weeklyThemes[Math.floor(index / 7)] ?? weeklyThemes[0],
          },
        },
        {
          order: 1,
          actionType: "TASK",
          integrationType: "TASK_TRACKER",
          title: listeningDay ? "Прослушать короткий фрагмент на английском" : "Прочитать короткий текст на английском",
          description: listeningDay
            ? "Подойдёт диалог, короткое видео или подкаст 3-7 минут."
            : "Подойдёт статья, рассказ, адаптированный отрывок или заметка на знакомую тему.",
          required: true,
          estimatedMinutes: 15,
          payloadJson: {
            mode: listeningDay ? "listening" : "reading",
          },
        },
        {
          order: 2,
          actionType: reviewDay ? "MILESTONE" : "REFLECTION",
          integrationType: reviewDay ? "NONE" : "JOURNAL",
          title: reviewDay ? "Сделать недельный обзор" : "Коротко отметить, что запомнилось",
          description: reviewDay
            ? "Выберите слова и фразы недели, которые уже начали ощущаться своими."
            : "Одной-двумя фразами: что стало понятнее, чем вчера.",
          required: false,
          estimatedMinutes: 5,
        },
      ],
      milestones: reviewDay
        ? [
            {
              order: 0,
              title: dayNumber === 21 ? "Цикл английского завершён" : `Недельный рубеж ${Math.ceil(dayNumber / 7)}`,
              description: "Закреплён очередной этап программы английского.",
              targetDay: dayNumber,
              metricKey: "english_cycle",
            },
          ]
        : [],
    };
  });

  return {
    title: "Программа английского",
    description: "Системная программа от сайта: словарь, чтение, аудирование и еженедельный обзор без перегруза.",
    category: "Обучение",
    theme: "Английский",
    durationDays: 21,
    structureType: "FIXED_DURATION",
    collaborativeEnabled: true,
    rules: {
      allowSkip: true,
      allowPause: true,
      allowResume: true,
      allowCancel: true,
      allowRecovery: true,
      maxReschedulesPerAction: 2,
      recoveryConfigJson: {
        allowSoftCatchUp: true,
        allowRecoveryDay: true,
        allowShiftForward: true,
      },
    },
    stages: [
      { title: "Вход в ритм", description: "Привыкаем каждый день коротко входить в язык.", startDay: 1, endDay: 7, milestoneText: "Первая неделя без перегруза" },
      { title: "Закрепление", description: "Меньше хаоса, больше повторения и понятных шаблонов.", startDay: 8, endDay: 14, milestoneText: "Язык стал привычнее" },
      { title: "Своя база", description: "Собираем собственный рабочий набор слов и привычек.", startDay: 15, endDay: 21, milestoneText: "Цикл завершён устойчиво" },
    ],
    days,
  };
}

function buildSavingsProgram(): SystemProgramSpec {
  const days = Array.from({ length: 21 }, (_, index) => {
    const dayNumber = index + 1;
    const checkpoint = [7, 14, 21].includes(dayNumber);

    return {
      dayNumber,
      title: checkpoint ? `Контрольная точка ${Math.ceil(dayNumber / 7)}` : null,
      dayText: checkpoint
        ? "Сегодня не гонимся за идеальным бюджетом. Смотрим, что реально помогает удерживать накопление без чувства наказания."
        : "Накопление держится на повторяемых мелких решениях: видеть цель, не терять лимит и замечать лишние траты вовремя.",
      tipOfDay: checkpoint
        ? "Пересмотрите только 2-3 самые заметные траты недели, не превращая обзор в самокритику."
        : "Проще удержать цель, если заранее решить, на чём вы экономите спокойно, а где не будете давить на себя.",
      motivationOfDay: "Каждый спокойный день в рамках лимита работает лучше, чем редкие жёсткие ограничения с последующим откатом.",
      reflectionPrompt: "Какая одна финансовая привычка сегодня реально приближает вас к цели?",
      actions: [
        {
          order: 0,
          actionType: "FINANCE_TARGET",
          integrationType: "FINANCE",
          title: "Проверить дневной лимит и накопление",
          description: "Коротко сверить траты дня и сумму, которую хотите отложить.",
          required: true,
          estimatedMinutes: 5,
          payloadJson: {
            dailySpendLimit: 1500,
            savingsTarget: 500,
            currency: "RUB",
          },
        },
        {
          order: 1,
          actionType: "TASK",
          integrationType: "TASK_TRACKER",
          title: checkpoint ? "Сделать обзор трат недели" : "Избежать одной импульсивной траты",
          description: checkpoint
            ? "Отметьте, какие траты повторяются чаще всего и что хочется упростить."
            : "Выберите один тип лишней покупки, который сегодня сознательно пропускаете.",
          required: true,
          estimatedMinutes: checkpoint ? 12 : 3,
        },
        {
          order: 2,
          actionType: "REFLECTION",
          integrationType: "JOURNAL",
          title: "Короткая заметка о деньгах",
          description: "Одной фразой: где сегодня получилось удержаться в плане легче всего.",
          required: false,
          estimatedMinutes: 3,
        },
      ],
      milestones: checkpoint
        ? [
            {
              order: 0,
              title: dayNumber === 21 ? "Первый цикл накоплений завершён" : `Неделя накоплений ${Math.ceil(dayNumber / 7)}`,
              description: "Закреплён очередной шаг в программе накоплений.",
              targetDay: dayNumber,
              metricKey: "savings_cycle",
            },
          ]
        : [],
    };
  });

  return {
    title: "Программа накоплений",
    description: "Системная программа от сайта: дневной лимит, мягкий контроль трат и пошаговое формирование привычки копить.",
    category: "Финансы",
    theme: "Накопления",
    durationDays: 21,
    structureType: "FIXED_DURATION",
    collaborativeEnabled: true,
    rules: {
      allowSkip: true,
      allowPause: true,
      allowResume: true,
      allowCancel: true,
      allowRecovery: true,
      maxReschedulesPerAction: 2,
      recoveryConfigJson: {
        allowSoftCatchUp: true,
        allowRecoveryDay: true,
        allowShiftForward: true,
      },
      integrationConfigJson: {
        finance: true,
        tasks: true,
      },
    },
    stages: [
      { title: "Основа", description: "Фиксируем лимит и делаем накопление заметным.", startDay: 1, endDay: 7, milestoneText: "Первые устойчивые решения" },
      { title: "Контроль", description: "Учимся замечать импульсивные траты до, а не после покупки.", startDay: 8, endDay: 14, milestoneText: "Меньше случайных трат" },
      { title: "Закрепление", description: "Собираем простой сценарий, который реально можно повторять дальше.", startDay: 15, endDay: 21, milestoneText: "Цикл накопления завершён" },
    ],
    days,
  };
}

const SYSTEM_PROGRAMS: SystemProgramSpec[] = [
  buildQuitSmokingProgram(),
  buildWeightLossProgram(),
  buildEnglishProgram(),
  buildSavingsProgram(),
];

function findStageIdForDay(stageMap: Array<{ id: string; startDay: number; endDay: number }>, dayNumber: number) {
  return stageMap.find((stage) => dayNumber >= stage.startDay && dayNumber <= stage.endDay)?.id ?? null;
}

async function createSystemProgram(spec: SystemProgramSpec) {
  const existing = await prisma.programDefinition.findFirst({
    where: {
      sourceType: "SYSTEM",
      title: spec.title,
      deletedAt: null,
    },
    select: {
      id: true,
      currentVersionId: true,
    },
  });

  if (existing?.currentVersionId) {
    return existing.id;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const definition =
      existing
        ? await tx.programDefinition.update({
            where: { id: existing.id },
            data: {
              sourceType: "SYSTEM",
              title: spec.title,
              description: spec.description,
              category: spec.category,
              theme: spec.theme,
              language: "ru",
              durationDays: spec.durationDays,
              accessMode: "PUBLIC",
              structureType: spec.structureType,
              collaborativeEnabled: spec.collaborativeEnabled,
              lifecycleStatus: "PUBLISHED",
              archivedAt: null,
              deletedAt: null,
              publishedAt: now,
            },
          })
        : await tx.programDefinition.create({
            data: {
              ownerId: null,
              sourceType: "SYSTEM",
              title: spec.title,
              description: spec.description,
              category: spec.category,
              theme: spec.theme,
              language: "ru",
              durationDays: spec.durationDays,
              accessMode: "PUBLIC",
              structureType: spec.structureType,
              collaborativeEnabled: spec.collaborativeEnabled,
              lifecycleStatus: "PUBLISHED",
              publishedAt: now,
            } as any,
          });

    const versionNumber = (await tx.programVersion.count({ where: { definitionId: definition.id } })) + 1;
    const version = await tx.programVersion.create({
      data: {
        definitionId: definition.id,
        versionNumber,
        title: spec.title,
        description: spec.description,
        category: spec.category,
        theme: spec.theme,
        language: "ru",
        durationDays: spec.durationDays,
        accessMode: "PUBLIC",
        structureType: spec.structureType,
        collaborativeEnabled: spec.collaborativeEnabled,
        publishedById: null,
        publishedAt: now,
      } as any,
    });

    await tx.programRuleSet.create({
      data: {
        programVersionId: version.id,
        allowSkip: spec.rules.allowSkip ?? true,
        allowPause: spec.rules.allowPause ?? true,
        allowResume: spec.rules.allowResume ?? true,
        allowCancel: spec.rules.allowCancel ?? true,
        allowRecovery: spec.rules.allowRecovery ?? true,
        maxReschedulesPerAction: spec.rules.maxReschedulesPerAction ?? 3,
        recoveryConfigJson: toPrismaNullableJson(spec.rules.recoveryConfigJson ?? null),
        progressConfigJson: toPrismaNullableJson(spec.rules.progressConfigJson ?? null),
        integrationConfigJson: toPrismaNullableJson(spec.rules.integrationConfigJson ?? null),
      },
    });

    const stageMap = [] as Array<{ id: string; startDay: number; endDay: number }>;
    for (const [index, stage] of spec.stages.entries()) {
      const created = await tx.programStage.create({
        data: {
          programVersionId: version.id,
          order: index,
          title: stage.title,
          description: stage.description,
          startDay: stage.startDay,
          endDay: stage.endDay,
          milestoneText: stage.milestoneText ?? null,
        },
      });
      stageMap.push({ id: created.id, startDay: stage.startDay, endDay: stage.endDay });
    }

    for (const [dayIndex, day] of spec.days.entries()) {
      const stageId = findStageIdForDay(stageMap, day.dayNumber);
      const createdDay = await tx.programDayTemplate.create({
        data: {
          programVersionId: version.id,
          programStageId: stageId,
          dayNumber: day.dayNumber,
          title: day.title ?? null,
          dayText: day.dayText ?? null,
          tipOfDay: day.tipOfDay ?? null,
          motivationOfDay: day.motivationOfDay ?? null,
          reflectionPrompt: day.reflectionPrompt ?? null,
          isRecoveryTemplate: false,
          sortOrder: dayIndex,
        },
      });

      for (const action of day.actions) {
        await tx.programActionTemplate.create({
          data: {
            programVersionId: version.id,
            programDayTemplateId: createdDay.id,
            programStageId: stageId,
            order: action.order,
            actionType: action.actionType as any,
            integrationType: (action.integrationType ?? "NONE") as any,
            title: action.title,
            description: action.description ?? null,
            required: action.required ?? true,
            estimatedMinutes: action.estimatedMinutes ?? null,
            completionPolicy: action.completionPolicy ?? null,
            reschedulePolicy: action.reschedulePolicy ?? null,
            payloadJson: toPrismaNullableJson(action.payloadJson ?? null),
          },
        });
      }

      for (const milestone of day.milestones ?? []) {
        await tx.programMilestoneTemplate.create({
          data: {
            programVersionId: version.id,
            programDayTemplateId: createdDay.id,
            programStageId: stageId,
            order: milestone.order,
            title: milestone.title,
            description: milestone.description ?? null,
            targetDay: milestone.targetDay ?? day.dayNumber,
            metricKey: milestone.metricKey ?? null,
            payloadJson: toPrismaNullableJson(milestone.payloadJson ?? null),
          },
        });
      }
    }

    await tx.programDefinition.update({
      where: { id: definition.id },
      data: {
        currentVersionId: version.id,
        lifecycleStatus: "PUBLISHED",
        publishedAt: now,
      },
    });
  });
}

let ensureSystemProgramsPromise: Promise<void> | null = null;

export async function ensureSystemPrograms() {
  if (!ensureSystemProgramsPromise) {
    ensureSystemProgramsPromise = (async () => {
      for (const spec of SYSTEM_PROGRAMS) {
        await createSystemProgram(spec);
      }
    })().catch((error) => {
      ensureSystemProgramsPromise = null;
      throw error;
    });
  }

  await ensureSystemProgramsPromise;
}
