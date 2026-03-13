const BASHO_NAMES: Record<string, string> = {
  "01": "HATSU BASHO",
  "03": "HARU BASHO",
  "05": "NATSU BASHO",
  "07": "NAGOYA BASHO",
  "09": "AKI BASHO",
  "11": "KYUSHU BASHO",
};

/** Converts a basho ID like "202603" to "HARU BASHO 2026". */
export function bashoLabel(id: string): string {
  const year = id.slice(0, 4);
  const month = id.slice(4, 6);
  const name = BASHO_NAMES[month];
  return name ? `${name} ${year}` : id;
}
