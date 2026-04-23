package com.phonetopcspeaker.captureprobe;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;

final class WavFileWriter implements AutoCloseable {
    private static final int HEADER_LENGTH = 44;

    private final RandomAccessFile file;
    private final int sampleRate;
    private final short channelCount;
    private final short bitsPerSample;
    private long dataLength;

    WavFileWriter(File targetFile, int sampleRate, short channelCount, short bitsPerSample) throws IOException {
        this.file = new RandomAccessFile(targetFile, "rw");
        this.sampleRate = sampleRate;
        this.channelCount = channelCount;
        this.bitsPerSample = bitsPerSample;
        this.dataLength = 0L;
        writeHeader();
    }

    void write(byte[] buffer, int offset, int length) throws IOException {
        file.write(buffer, offset, length);
        dataLength += length;
    }

    @Override
    public void close() throws IOException {
        file.seek(0L);
        writeHeader();
        file.close();
    }

    private void writeHeader() throws IOException {
        int byteRate = sampleRate * channelCount * bitsPerSample / 8;
        short blockAlign = (short) (channelCount * bitsPerSample / 8);

        file.writeBytes("RIFF");
        writeIntLittleEndian((int) (36 + dataLength));
        file.writeBytes("WAVE");
        file.writeBytes("fmt ");
        writeIntLittleEndian(16);
        writeShortLittleEndian((short) 1);
        writeShortLittleEndian(channelCount);
        writeIntLittleEndian(sampleRate);
        writeIntLittleEndian(byteRate);
        writeShortLittleEndian(blockAlign);
        writeShortLittleEndian(bitsPerSample);
        file.writeBytes("data");
        writeIntLittleEndian((int) dataLength);

        if (file.getFilePointer() < HEADER_LENGTH) {
            file.setLength(HEADER_LENGTH);
            file.seek(HEADER_LENGTH);
        }
    }

    private void writeIntLittleEndian(int value) throws IOException {
        file.writeByte(value & 0xFF);
        file.writeByte((value >> 8) & 0xFF);
        file.writeByte((value >> 16) & 0xFF);
        file.writeByte((value >> 24) & 0xFF);
    }

    private void writeShortLittleEndian(short value) throws IOException {
        file.writeByte(value & 0xFF);
        file.writeByte((value >> 8) & 0xFF);
    }
}
