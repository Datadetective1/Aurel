import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'

/**
 * Android has no combined date-and-time picker: the system shows the day,
 * then the time, as two dialogs. Backing out of either changes nothing.
 * (iOS shows one inline picker in the form itself.)
 */
export function pickOnAndroid(from: Date, tz: string, onPicked: (at: Date) => void) {
  DateTimePickerAndroid.open({
    value: from,
    mode: 'date',
    timeZoneName: tz,
    onValueChange: (_event, day) => {
      DateTimePickerAndroid.open({
        value: day,
        mode: 'time',
        minuteInterval: 5,
        timeZoneName: tz,
        onValueChange: (_e, at) => onPicked(at),
      })
    },
  })
}
