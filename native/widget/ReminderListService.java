package io.github.bearbabybaby_ai.bearbao;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

/** 小工具裡可上下滑動的提醒清單 */
public class ReminderListService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static class Factory implements RemoteViewsFactory {
        private final Context context;
        private List<WidgetData.Item> items = new ArrayList<>();
        private int period = WidgetData.DAY;

        Factory(Context context) { this.context = context; }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            List<WidgetData.Item> list = WidgetData.reminders(context);
            items = list == null ? new ArrayList<WidgetData.Item>() : list;
            period = WidgetData.period();
        }

        @Override public void onDestroy() { items.clear(); }

        @Override public int getCount() { return items.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_item);
            if (position < 0 || position >= items.size()) return v;
            WidgetData.Item it = items.get(position);
            int color = WidgetData.category(it.cat, period);
            v.setTextViewText(R.id.itemTitle, it.title);
            v.setTextColor(R.id.itemTitle, color);
            v.setTextViewText(R.id.itemWhen, it.when);
            v.setTextColor(R.id.itemWhen, color);
            v.setOnClickFillInIntent(R.id.itemRoot, new Intent());
            return v;
        }

        @Override public RemoteViews getLoadingView() { return null; }

        @Override public int getViewTypeCount() { return 1; }

        @Override public long getItemId(int position) { return position; }

        @Override public boolean hasStableIds() { return false; }
    }
}
