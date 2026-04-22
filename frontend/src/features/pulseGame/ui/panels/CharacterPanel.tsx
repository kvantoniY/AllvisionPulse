'use client';

import { useEffect, useState, type ChangeEvent, type HTMLAttributes } from 'react';

import { useUpdateProfileMutation } from '@/shared/api/pulseApi';
import { Icon } from '@/shared/ui/Icon/Icon';

import type { PulseAvatarAppearance } from '../../lib/avatarAppearance';
import type { AvatarGender, RoomTheme } from '../../lib/types';
import { useAvatarCustomization } from '../../model/useAvatarCustomization';
import type { GameState } from '../../model/useGameState';
import { useRoomCustomization } from '../../model/useRoomCustomization';
import { PulseAvatar } from '../avatar/PulseAvatar';
import frameStyles from './PanelFrame.module.css';
import styles from './CharacterPanel.module.css';

const COPY = {
  profileLabel: 'Профиль персонажа',
  dataSummaryTitle: 'Данные профиля',
  dataEditTitle: 'Редактирование данных',
  dataEditSubtitle: 'Вес, рост, возраст и целевые значения для расчетов внутри Pulse.',
  editData: 'Редактировать данные',
  closeDataEdit: 'Скрыть редактирование',
  saveButton: 'Сохранить данные',
  savingButton: 'Сохраняю...',
  cancelButton: 'Отмена',
  saveSuccess: 'Параметры персонажа сохранены.',
  saveError: 'Не удалось сохранить параметры персонажа.',
  openAppearanceEditor: 'Открыть кастомизацию персонажа',
  closeAppearanceEditor: 'Закрыть кастомизацию персонажа',
  appearanceTitle: 'Кастомизация персонажа',
  appearanceSubtitle: 'Изменения внешности применяются сразу и сохраняются в браузере.',
  appearanceDoneButton: 'Готово',
  resetButton: 'Сбросить стиль',
  genderTitle: 'База аватара',
  genderSubtitle: 'Переключение между мужской и женской основой персонажа.',
  roomTitle: 'Кастомизация комнаты',
  roomSubtitle:
    'Пока меняем только фон комнаты. Выбранная тема фиксируется и не зависит от состояния.',
  roomDefault: 'Светлая',
  roomDefaultMeta: 'Теплый базовый интерьер',
  roomBlue: 'Синяя',
  roomBlueMeta: 'Прохладная спокойная тема',
  labelGender: 'Пол',
  labelAge: 'Возраст',
  labelWeight: 'Вес',
  labelHeight: 'Рост',
  labelTargetWeight: 'Цель',
  labelStartWeight: 'Старт',
  labelCaloriesGoal: 'Калории',
  fieldAge: 'Возраст',
  fieldWeight: 'Текущий вес, кг',
  fieldTargetWeight: 'Целевой вес, кг',
  fieldStartWeight: 'Стартовый вес, кг',
  fieldHeight: 'Рост, см',
  fieldCaloriesGoal: 'Цель по калориям',
  fieldTop: 'Прическа',
  fieldHairColor: 'Цвет волос',
  fieldSkin: 'Тон кожи',
  fieldAccessories: 'Очки и аксессуары',
  fieldFacialHair: 'Борода и усы',
  fieldClothes: 'Одежда',
  fieldClothesColor: 'Цвет одежды',
  fieldEyes: 'Глаза',
  fieldEyebrows: 'Брови',
  fieldMouth: 'Мимика',
  male: 'Мужская база',
  female: 'Женская база',
};

const NUMBER_FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

type PanelMode = 'view' | 'data' | 'appearance';
type StatusTone = 'neutral' | 'success' | 'error';

type ProfileFormState = {
  age: string;
  heightCm: string;
  currentWeightKg: string;
  targetWeightKg: string;
  startWeightKg: string;
  dailyCaloriesGoal: string;
};

const ROOM_THEME_OPTIONS: Array<{
  value: RoomTheme;
  label: string;
  meta: string;
  previewClassName: string;
}> = [
  {
    value: 'default',
    label: COPY.roomDefault,
    meta: COPY.roomDefaultMeta,
    previewClassName: styles.roomPreviewDefault,
  },
  {
    value: 'blue',
    label: COPY.roomBlue,
    meta: COPY.roomBlueMeta,
    previewClassName: styles.roomPreviewBlue,
  },
];

const TOP_OPTIONS: Array<{ value: PulseAvatarAppearance['topType']; label: string }> = [
  { value: 'ShortHairShortFlat', label: 'Короткая ровная' },
  { value: 'ShortHairSides', label: 'Короткие бока' },
  { value: 'ShortHairTheCaesarSidePart', label: 'Боковой пробор' },
  { value: 'ShortHairShortRound', label: 'Короткая круглая' },
  { value: 'LongHairBob', label: 'Каре' },
  { value: 'LongHairMiaWallace', label: 'Гладкое каре' },
  { value: 'LongHairBun', label: 'Пучок' },
  { value: 'LongHairStraight2', label: 'Длинные прямые' },
  { value: 'LongHairCurvy', label: 'Мягкие волны' },
  { value: 'NoHair', label: 'Без волос' },
];

const HAIR_COLOR_OPTIONS: Array<{ value: PulseAvatarAppearance['hairColor']; label: string }> = [
  { value: 'Black', label: 'Черный' },
  { value: 'BrownDark', label: 'Темно-каштановый' },
  { value: 'Brown', label: 'Каштановый' },
  { value: 'Auburn', label: 'Русый теплый' },
  { value: 'Blonde', label: 'Теплый блонд' },
  { value: 'BlondeGolden', label: 'Золотистый блонд' },
  { value: 'Red', label: 'Рыжий' },
  { value: 'SilverGray', label: 'Серебристый' },
  { value: 'Platinum', label: 'Платиновый' },
];

const ACCESSORY_OPTIONS: Array<{ value: PulseAvatarAppearance['accessoriesType']; label: string }> = [
  { value: 'Blank', label: 'Без аксессуаров' },
  { value: 'Round', label: 'Круглые очки' },
  { value: 'Prescription01', label: 'Очки тонкая оправа' },
  { value: 'Prescription02', label: 'Очки широкая оправа' },
  { value: 'Wayfarers', label: 'Wayfarer' },
  { value: 'Sunglasses', label: 'Солнцезащитные' },
];

const FACIAL_HAIR_OPTIONS: Array<{ value: PulseAvatarAppearance['facialHairType']; label: string }> = [
  { value: 'Blank', label: 'Без бороды' },
  { value: 'BeardLight', label: 'Легкая борода' },
  { value: 'BeardMedium', label: 'Средняя борода' },
  { value: 'MoustacheFancy', label: 'Усы' },
  { value: 'MoustacheMagnum', label: 'Плотные усы' },
];

const CLOTHE_OPTIONS: Array<{ value: PulseAvatarAppearance['clotheType']; label: string }> = [
  { value: 'Hoodie', label: 'Худи' },
  { value: 'ShirtCrewNeck', label: 'Футболка' },
  { value: 'ShirtVNeck', label: 'Футболка V-вырез' },
  { value: 'BlazerShirt', label: 'Пиджак и рубашка' },
  { value: 'BlazerSweater', label: 'Пиджак и свитер' },
  { value: 'CollarSweater', label: 'Свитер с воротом' },
  { value: 'GraphicShirt', label: 'Футболка с принтом' },
];

const CLOTHE_COLOR_OPTIONS: Array<{ value: PulseAvatarAppearance['clotheColor']; label: string }> = [
  { value: 'Black', label: 'Черный' },
  { value: 'Blue02', label: 'Синий' },
  { value: 'Heather', label: 'Графит' },
  { value: 'PastelBlue', label: 'Пастельный голубой' },
  { value: 'PastelGreen', label: 'Пастельный зеленый' },
  { value: 'PastelOrange', label: 'Пастельный оранжевый' },
  { value: 'PastelRed', label: 'Пастельный розовый' },
  { value: 'PastelYellow', label: 'Пастельный желтый' },
  { value: 'Pink', label: 'Яркий розовый' },
  { value: 'Red', label: 'Красный' },
  { value: 'White', label: 'Белый' },
];

const EYE_OPTIONS: Array<{ value: PulseAvatarAppearance['eyeType']; label: string }> = [
  { value: 'Default', label: 'Спокойный взгляд' },
  { value: 'Happy', label: 'Радостный взгляд' },
  { value: 'Squint', label: 'Узкий взгляд' },
  { value: 'Wink', label: 'Подмигивание' },
  { value: 'Hearts', label: 'Глаза-сердца' },
  { value: 'Surprised', label: 'Удивление' },
];

const EYEBROW_OPTIONS: Array<{ value: PulseAvatarAppearance['eyebrowType']; label: string }> = [
  { value: 'Default', label: 'Классика' },
  { value: 'DefaultNatural', label: 'Естественные' },
  { value: 'RaisedExcitedNatural', label: 'Приподнятые' },
  { value: 'FlatNatural', label: 'Прямые' },
  { value: 'SadConcernedNatural', label: 'Мягкие грустные' },
  { value: 'UpDownNatural', label: 'Выразительные' },
];

const MOUTH_OPTIONS: Array<{ value: PulseAvatarAppearance['mouthType']; label: string }> = [
  { value: 'Smile', label: 'Улыбка' },
  { value: 'Default', label: 'Нейтрально' },
  { value: 'Twinkle', label: 'Игриво' },
  { value: 'Serious', label: 'Серьезно' },
  { value: 'Sad', label: 'Задумчиво' },
  { value: 'Eating', label: 'Мягкая линия' },
];

const SKIN_OPTIONS: Array<{ value: PulseAvatarAppearance['skinColor']; label: string }> = [
  { value: 'Pale', label: 'Светлый' },
  { value: 'Light', label: 'Теплый светлый' },
  { value: 'Tanned', label: 'Загорелый' },
  { value: 'Brown', label: 'Карамельный' },
  { value: 'DarkBrown', label: 'Темный коричневый' },
  { value: 'Black', label: 'Глубокий темный' },
];

export function CharacterPanel({
  game,
  nick,
  onOpenMental: _onOpenMental,
}: {
  game: GameState;
  nick: string;
  onOpenMental: () => void;
}) {
  const { gender, appearance, setGender, patchAppearance, resetAppearance } = useAvatarCustomization();
  const { roomTheme, setRoomTheme } = useRoomCustomization();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [panelMode, setPanelMode] = useState<PanelMode>('view');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<StatusTone>('neutral');
  const [form, setForm] = useState<ProfileFormState>(() => createProfileForm(game));

  useEffect(() => {
    setForm(createProfileForm(game));
  }, [
    game.profile?.age,
    game.profile?.heightCm,
    game.profile?.currentWeightKg,
    game.profile?.targetWeightKg,
    game.profile?.startWeightKg,
    game.profile?.dailyCaloriesGoal,
  ]);

  const infoItems = [
    { label: COPY.labelGender, value: genderLabel(gender) },
    { label: COPY.labelAge, value: formatAge(game.profile?.age) },
    { label: COPY.labelWeight, value: formatMeasure(game.profile?.currentWeightKg, 'кг') },
    { label: COPY.labelHeight, value: formatMeasure(game.profile?.heightCm, 'см') },
    { label: COPY.labelTargetWeight, value: formatMeasure(game.profile?.targetWeightKg, 'кг') },
    { label: COPY.labelStartWeight, value: formatMeasure(game.profile?.startWeightKg, 'кг') },
    { label: COPY.labelCaloriesGoal, value: formatMeasure(game.profile?.dailyCaloriesGoal, 'ккал') },
  ];

  const handleOpenDataEditor = () => {
    setPanelMode((current) => (current === 'data' ? 'view' : 'data'));
    setStatusMessage(null);
    setStatusTone('neutral');
    setForm(createProfileForm(game));
  };

  const handleOpenAppearanceEditor = () => {
    setPanelMode((current) => (current === 'appearance' ? 'view' : 'appearance'));
    setStatusMessage(null);
    setStatusTone('neutral');
  };

  const handleCancelDataEdit = () => {
    setForm(createProfileForm(game));
    setPanelMode('view');
    setStatusMessage(null);
    setStatusTone('neutral');
  };

  const handleCloseAppearanceEditor = () => {
    setPanelMode('view');
    setStatusMessage(null);
    setStatusTone('neutral');
  };

  const handleFormChange =
    (field: keyof ProfileFormState) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
    };

  const handleSaveProfile = async () => {
    const body = {
      age: parseInteger(form.age),
      heightCm: parseNumber(form.heightCm),
      currentWeightKg: parseNumber(form.currentWeightKg),
      targetWeightKg: parseNumber(form.targetWeightKg),
      startWeightKg: parseNumber(form.startWeightKg),
      dailyCaloriesGoal: parseInteger(form.dailyCaloriesGoal),
    };

    try {
      await updateProfile(body).unwrap();
      setStatusTone('success');
      setStatusMessage(COPY.saveSuccess);
      setPanelMode('view');
    } catch {
      setStatusTone('error');
      setStatusMessage(COPY.saveError);
    }
  };

  return (
    <div className={frameStyles.frame}>
      <section className={frameStyles.heroCard}>
        <div className={styles.heroSplit}>
          <div className={styles.avatarColumn}>
            <div className={styles.previewAvatarCard}>
              <div className={styles.previewBadgeRow}>
                <span className={styles.previewBadge}>
                  <Icon name="flame" size={12} />
                  <span>{game.streak.current}</span>
                </span>
                <span className={`${styles.previewBadge} ${styles.previewBadgeMuted}`}>
                  {`${game.stateScore}/100`}
                </span>
              </div>

              <div className={styles.previewCardIdentity}>
                <span className={styles.previewCardLabel}>{COPY.profileLabel}</span>
                <strong className={styles.previewCardName}>{nick}</strong>
              </div>

              <div className={styles.previewAvatarWrap}>
                <div className={styles.previewAvatarGlow} aria-hidden="true" />
                <PulseAvatar appearance={appearance} className={styles.previewAvatar} />
              </div>

              <div className={styles.previewAvatarAction}>
                <button
                  type="button"
                  className={styles.previewAvatarEditButton}
                  aria-label={
                    panelMode === 'appearance'
                      ? COPY.closeAppearanceEditor
                      : COPY.openAppearanceEditor
                  }
                  title={
                    panelMode === 'appearance'
                      ? COPY.closeAppearanceEditor
                      : COPY.openAppearanceEditor
                  }
                  aria-pressed={panelMode === 'appearance'}
                  onClick={handleOpenAppearanceEditor}
                >
                  <Icon name="pencil" size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className={styles.sidePanel}>
            <div className={styles.sidePanelCard} data-mode={panelMode}>
              <div className={styles.sidePanelHeader}>
                <div className={styles.sidePanelHeaderCopy}>
                  <strong className={styles.sidePanelTitle}>
                    {panelMode === 'appearance'
                      ? COPY.appearanceTitle
                      : panelMode === 'data'
                        ? COPY.dataEditTitle
                        : COPY.dataSummaryTitle}
                  </strong>
                </div>

                {panelMode !== 'appearance' ? (
                  <button
                    type="button"
                    className={styles.inlineEditButton}
                    onClick={handleOpenDataEditor}
                    aria-label={panelMode === 'data' ? COPY.closeDataEdit : COPY.editData}
                    title={panelMode === 'data' ? COPY.closeDataEdit : COPY.editData}
                  >
                    <Icon name="pencil" size={18} />
                  </button>
                ) : null}
              </div>

              {statusMessage ? (
                <div className={styles.statusNote} data-tone={statusTone}>
                  {statusMessage}
                </div>
              ) : null}

              <div className={styles.sidePanelBody}>
                {panelMode === 'view' ? (
                  <div className={styles.infoList}>
                    {infoItems.map((item) => (
                      <InfoRow key={item.label} label={item.label} value={item.value} />
                    ))}
                  </div>
                ) : panelMode === 'data' ? (
                  <div className={styles.editorScroll}>
                    <div className={styles.infoList}>
                      <InfoSegmentRow
                        label={COPY.labelGender}
                        value={gender}
                        options={[
                          { value: 'male', label: genderLabel('male') },
                          { value: 'female', label: genderLabel('female') },
                        ]}
                        onChange={(value) => setGender(value)}
                      />
                      <InfoInputRow
                        label={COPY.fieldAge}
                        value={form.age}
                        inputMode="numeric"
                        placeholder="29"
                        onChange={handleFormChange('age')}
                      />
                      <InfoInputRow
                        label={COPY.fieldWeight}
                        value={form.currentWeightKg}
                        inputMode="decimal"
                        placeholder="78.4"
                        onChange={handleFormChange('currentWeightKg')}
                      />
                      <InfoInputRow
                        label={COPY.fieldHeight}
                        value={form.heightCm}
                        inputMode="decimal"
                        placeholder="172"
                        onChange={handleFormChange('heightCm')}
                      />
                      <InfoInputRow
                        label={COPY.fieldTargetWeight}
                        value={form.targetWeightKg}
                        inputMode="decimal"
                        placeholder="72"
                        onChange={handleFormChange('targetWeightKg')}
                      />
                      <InfoInputRow
                        label={COPY.fieldStartWeight}
                        value={form.startWeightKg}
                        inputMode="decimal"
                        placeholder="80"
                        onChange={handleFormChange('startWeightKg')}
                      />
                      <InfoInputRow
                        label={COPY.fieldCaloriesGoal}
                        value={form.dailyCaloriesGoal}
                        inputMode="numeric"
                        placeholder="2100"
                        onChange={handleFormChange('dailyCaloriesGoal')}
                      />
                    </div>
                  </div>
                ) : (
                  <div className={styles.editorScroll}>
                    <div className={styles.fieldsGrid}>
                      <SelectField
                        label={COPY.fieldTop}
                        value={appearance.topType}
                        options={TOP_OPTIONS}
                        onChange={(value) => patchAppearance({ topType: value })}
                      />
                      <SelectField
                        label={COPY.fieldHairColor}
                        value={appearance.hairColor}
                        options={HAIR_COLOR_OPTIONS}
                        onChange={(value) =>
                          patchAppearance({ hairColor: value, facialHairColor: value })
                        }
                      />
                      <SelectField
                        label={COPY.fieldSkin}
                        value={appearance.skinColor}
                        options={SKIN_OPTIONS}
                        onChange={(value) => patchAppearance({ skinColor: value })}
                      />
                      <SelectField
                        label={COPY.fieldAccessories}
                        value={appearance.accessoriesType}
                        options={ACCESSORY_OPTIONS}
                        onChange={(value) => patchAppearance({ accessoriesType: value })}
                      />
                      <SelectField
                        label={COPY.fieldFacialHair}
                        value={appearance.facialHairType}
                        options={FACIAL_HAIR_OPTIONS}
                        onChange={(value) => patchAppearance({ facialHairType: value })}
                      />
                      <SelectField
                        label={COPY.fieldClothes}
                        value={appearance.clotheType}
                        options={CLOTHE_OPTIONS}
                        onChange={(value) => patchAppearance({ clotheType: value })}
                      />
                      <SelectField
                        label={COPY.fieldClothesColor}
                        value={appearance.clotheColor}
                        options={CLOTHE_COLOR_OPTIONS}
                        onChange={(value) => patchAppearance({ clotheColor: value })}
                      />
                      <SelectField
                        label={COPY.fieldEyes}
                        value={appearance.eyeType}
                        options={EYE_OPTIONS}
                        onChange={(value) => patchAppearance({ eyeType: value })}
                      />
                      <SelectField
                        label={COPY.fieldEyebrows}
                        value={appearance.eyebrowType}
                        options={EYEBROW_OPTIONS}
                        onChange={(value) => patchAppearance({ eyebrowType: value })}
                      />
                      <SelectField
                        label={COPY.fieldMouth}
                        value={appearance.mouthType}
                        options={MOUTH_OPTIONS}
                        onChange={(value) => patchAppearance({ mouthType: value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {panelMode === 'data' ? (
                <div className={styles.sidePanelFooter}>
                  <button
                    type="button"
                    className={frameStyles.primary}
                    onClick={handleSaveProfile}
                    disabled={isLoading}
                  >
                    {isLoading ? COPY.savingButton : COPY.saveButton}
                  </button>
                  <button
                    type="button"
                    className={frameStyles.secondary}
                    onClick={handleCancelDataEdit}
                    disabled={isLoading}
                  >
                    {COPY.cancelButton}
                  </button>
                </div>
              ) : panelMode === 'appearance' ? (
                <div className={styles.sidePanelFooter}>
                  <button
                    type="button"
                    className={frameStyles.secondary}
                    onClick={() => resetAppearance(gender)}
                  >
                    {COPY.resetButton}
                  </button>
                  <button
                    type="button"
                    className={frameStyles.primary}
                    onClick={handleCloseAppearanceEditor}
                  >
                    {COPY.appearanceDoneButton}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className={frameStyles.sectionCard}>
        <div className={frameStyles.sectionHeader}>
          <div>
            <h3 className={frameStyles.sectionTitle}>{COPY.roomTitle}</h3>
          </div>
        </div>

        <div className={styles.roomThemeGrid}>
          {ROOM_THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.roomThemeOption}
              data-active={roomTheme === option.value}
              onClick={() => setRoomTheme(option.value)}
            >
              <span
                className={`${styles.roomThemePreview} ${option.previewClassName}`}
                aria-hidden="true"
              />
              <span className={styles.roomThemeCopy}>
                <strong>{option.label}</strong>
                <span>{option.meta}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoRowLabel}>{label}</span>
      <strong className={styles.infoRowValue}>{value}</strong>
    </div>
  );
}

function InfoInputRow({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode: HTMLAttributes<HTMLInputElement>['inputMode'];
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className={`${styles.infoRow} ${styles.infoRowEditable}`}>
      <span className={styles.infoRowLabel}>{label}</span>
      <input
        className={styles.infoRowInput}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={onChange}
      />
    </label>
  );
}

function InfoSegmentRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className={`${styles.infoRow} ${styles.infoRowEditable}`}>
      <span className={styles.infoRowLabel}>{label}</span>
      <div className={styles.infoRowSegmentGroup}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.infoSegmentButton}
            data-active={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className={frameStyles.field}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function createProfileForm(game: GameState): ProfileFormState {
  return {
    age: stringifyValue(game.profile?.age),
    heightCm: stringifyValue(game.profile?.heightCm),
    currentWeightKg: stringifyValue(game.profile?.currentWeightKg),
    targetWeightKg: stringifyValue(game.profile?.targetWeightKg),
    startWeightKg: stringifyValue(game.profile?.startWeightKg),
    dailyCaloriesGoal: stringifyValue(game.profile?.dailyCaloriesGoal),
  };
}

function stringifyValue(value: number | null | undefined): string {
  return value != null ? `${value}` : '';
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string): number | null {
  const parsed = parseNumber(value);
  if (parsed == null) return null;
  return Math.round(parsed);
}

function genderLabel(gender: AvatarGender): string {
  return gender === 'female' ? 'Женский' : 'Мужской';
}

function formatMeasure(value: number | null | undefined, unit: string): string {
  return value != null ? `${NUMBER_FORMAT.format(value)} ${unit}` : '-';
}

function formatAge(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${value} ${declineYears(value)}`;
}

function declineYears(value: number): string {
  const absValue = Math.abs(value);
  const mod10 = absValue % 10;
  const mod100 = absValue % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'год';
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'года';
  }

  return 'лет';
}
