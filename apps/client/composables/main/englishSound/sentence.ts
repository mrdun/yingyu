import { ref } from "vue";

import { useToolbar } from "~/composables/main/dictation";
import { usePronunciation } from "~/composables/user/pronunciation";
import { useCourseStore } from "~/store/course";

/** 慢速播放的倍率 */
export const SLOW_RATE = 0.6;

const { getPronunciationUrl } = usePronunciation();

// 参考 usePlayWordSound 的 Audio 模式：模块级单例 audio，便于跨组件做播放/暂停控制
const audio = new Audio();

/**
 * 整句发音播放（听写模式使用）
 * - 播放 URL 来自 getPronunciationUrl(整句英文)，type=2 美音（跟随用户发音设置）
 * - 慢速：有道 dictvoice 不支持 rate 参数，通过 audio.playbackRate 实现
 */
export function usePlaySentenceSound() {
  const courseStore = useCourseStore();
  const { toolBarData, saveToolBarData } = useToolbar();
  const isPlaying = ref(false);

  let playToken = 0;
  let timers: NodeJS.Timeout[] = [];

  audio.onplay = () => {
    isPlaying.value = true;
  };

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }

  /** 播放当前句子；times 重复次数，rate 倍率（不传则使用工具栏设置） */
  function playSentenceSound(times?: number, rate?: number) {
    const english = courseStore.currentStatement?.english;
    if (!english) return;

    pauseSentenceSound();
    const token = ++playToken;
    const repeatTimes = times ?? (Number(toolBarData.times) || 1);
    const playRate = rate ?? (Number(toolBarData.rate) || 1);
    let played = 1;

    audio.src = getPronunciationUrl(english);
    audio.playbackRate = playRate;
    audio.onended = () => {
      isPlaying.value = false;
      if (played < repeatTimes && token === playToken) {
        played += 1;
        timers.push(
          setTimeout(() => {
            if (token === playToken) {
              audio.play();
            }
          }, toolBarData.interval),
        );
      }
    };
    audio.play();
  }

  /** 暂停并复位 */
  function pauseSentenceSound() {
    playToken += 1;
    clearTimers();
    audio.pause();
    audio.currentTime = 0;
    isPlaying.value = false;
  }

  /** 播放/暂停切换 */
  function toggleSentenceSound() {
    if (isPlaying.value) {
      pauseSentenceSound();
    } else {
      playSentenceSound();
    }
  }

  /** 慢速开关：0.6 <-> 1，正在播放时实时生效 */
  function toggleSlowRate() {
    setRate(Number(toolBarData.rate) === SLOW_RATE ? 1 : SLOW_RATE);
  }

  function setRate(rate: number) {
    toolBarData.rate = rate;
    saveToolBarData();
    // 正在播放时实时调整倍速
    audio.playbackRate = rate;
  }

  return {
    isPlaying,
    playSentenceSound,
    pauseSentenceSound,
    toggleSentenceSound,
    toggleSlowRate,
    setRate,
  };
}
