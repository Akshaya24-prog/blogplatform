from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('blog', '0003_usertoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='comment',
            name='is_deleted',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='comment',
            name='deleted_by',
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
