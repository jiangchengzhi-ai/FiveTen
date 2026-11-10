@echo off
chcp 65001 >nul
title 江山 · 五代十国疆域时序

rem 纯静态页面，直接打开即可（无需服务器、无需联网）
start "" "%~dp0index.html"

echo.
echo   已用默认浏览器打开 index.html
echo   如果浏览器拦截本地文件，请用 Chrome 打开：
echo   "%~dp0index.html"
echo.
echo   操作：滚轮缩放 / 拖拽平移 / 底部时间轴拖动 / 空格播放 / 左右方向键逐年
echo.
timeout /t 3 >nul
