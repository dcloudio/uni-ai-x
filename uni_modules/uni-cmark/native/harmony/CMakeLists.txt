cmake_minimum_required(VERSION 3.10)
project(uni_cmark_harmony C CXX)

if(NOT DEFINED CMARK_GFM_SOURCE_DIR)
  message(FATAL_ERROR "CMARK_GFM_SOURCE_DIR must point to cmark-gfm 0.29.0.gfm.13")
endif()

set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMARK_TESTS OFF CACHE BOOL "" FORCE)
set(CMARK_SHARED OFF CACHE BOOL "" FORCE)
set(CMARK_STATIC ON CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

add_subdirectory(
  "${CMARK_GFM_SOURCE_DIR}"
  "${CMAKE_CURRENT_BINARY_DIR}/cmark-gfm"
  EXCLUDE_FROM_ALL
)

find_package(Threads REQUIRED)

add_library(cmark SHARED
  cmark_napi.cpp
  ../md2html.c
)
target_compile_definitions(cmark PRIVATE
  UNI_CMARK_NO_JNI
  CMARK_GFM_STATIC_DEFINE
  CMARK_GFM_EXTENSIONS_STATIC_DEFINE
)
target_include_directories(cmark PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/.."
  "${CMARK_GFM_SOURCE_DIR}/src"
  "${CMARK_GFM_SOURCE_DIR}/extensions"
  "${CMAKE_CURRENT_BINARY_DIR}/cmark-gfm/src"
  "${CMAKE_CURRENT_BINARY_DIR}/cmark-gfm/extensions"
)
target_link_libraries(cmark PRIVATE
  libace_napi.z.so
  libcmark-gfm-extensions_static
  libcmark-gfm_static
  Threads::Threads
)
target_link_options(cmark PRIVATE "-Wl,--exclude-libs,ALL")
