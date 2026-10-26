package io.github.bearbabybaby_ai.bearbao;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Bundle;

import java.util.ArrayList;
import java.util.List;

/** 小工具的風浪地區下拉選單 */
public class AreaPickerActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final List<String> keys = new ArrayList<>();
        final List<String> labels = new ArrayList<>();
        boolean auto = WidgetData.autoArea(this);
        String current = WidgetData.area(this);
        keys.add("");
        labels.add((auto ? "✔ " : "") + "📍 依定位自動判斷");
        for (String k : WidgetData.AREAS.keySet()) {
            keys.add(k);
            labels.add((!auto && k.equals(current) ? "✔ " : "") + k);
        }
        new AlertDialog.Builder(this)
            .setTitle("選擇風浪地區")
            .setItems(labels.toArray(new String[0]), new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    WidgetData.prefs(AreaPickerActivity.this).edit().putString("xb.widgetArea", keys.get(which)).apply();
                    ReminderWidget.refresh(AreaPickerActivity.this);
                    finish();
                }
            })
            .setOnCancelListener(new DialogInterface.OnCancelListener() {
                @Override
                public void onCancel(DialogInterface dialog) { finish(); }
            })
            .show();
    }
}
