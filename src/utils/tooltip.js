/** Native browser tooltip via title attribute. */
export function getTooltipProps(text, _position) {
  return { title: text ?? '' };
}
