export function getColors(theme = 'dark') {
  const isLight = theme === 'light';
  return {
    b: (s) => `\x1b[1m${s}\x1b[0m`,
    dim: (s) => isLight ? `\x1b[90m${s}\x1b[0m` : `\x1b[2m${s}\x1b[0m`,
    g: (s) => isLight ? `\x1b[38;2;40;138;0m${s}\x1b[0m` : `\x1b[38;2;101;255;0m${s}\x1b[0m`,
    y: (s) => isLight ? `\x1b[33m${s}\x1b[0m` : `\x1b[93m${s}\x1b[0m`,
    r: (s) => isLight ? `\x1b[38;2;214;21;0m${s}\x1b[0m` : `\x1b[38;2;255;26;0m${s}\x1b[0m`,
    cyan: (s) => isLight ? `\x1b[38;2;0;124;153m${s}\x1b[0m` : `\x1b[38;2;0;229;255m${s}\x1b[0m`,
    purple: (s) => isLight ? `\x1b[38;2;120;0;199m${s}\x1b[0m` : `\x1b[38;2;154;0;255m${s}\x1b[0m`,
  };
}
