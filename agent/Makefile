CC = gcc
CFLAGS = -O2 -Wall -Wextra -I/usr/include -I/opt/cuda/include
LDFLAGS = -lnvidia-ml -lpci -lmicrohttpd

TARGET = gputempd

SRCS = main.c gpu.c logger.c
OBJS = $(SRCS:.c=.o)

.PHONY: all clean install

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

clean:
	rm -f $(OBJS) $(TARGET)

install: $(TARGET)
	install -m 755 $(TARGET) /usr/local/bin/

uninstall:
	rm -f /usr/local/bin/$(TARGET)
