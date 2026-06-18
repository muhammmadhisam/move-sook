FROM postgres:16-alpine
RUN apk add --no-cache rclone bash tzdata \
 && cp /usr/share/zoneinfo/Asia/Bangkok /etc/localtime \
 && echo "Asia/Bangkok" > /etc/timezone
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh \
 && mkdir -p /etc/crontabs \
 && echo '0 3 * * * /usr/local/bin/backup.sh >> /backups/backup.log 2>&1' > /etc/crontabs/root
# foreground busybox cron; backup.sh also echoes to the logfile in /backups
CMD ["crond", "-f", "-l", "8"]
