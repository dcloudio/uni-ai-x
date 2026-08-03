cmake_minimum_required(VERSION 3.10)
project(uni_cmark_html C)

if(NOT DEFINED CMARK_GFM_SOURCE_DIR)
  message(FATAL_ERROR "CMARK_GFM_SOURCE_DIR must point to cmark-gfm 0.29.0.gfm.13")
endif()

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

set(UNI_CMARK_HTML_LIBRARIES
  libcmark-gfm-extensions_static
  libcmark-gfm_static
  Threads::Threads
)

add_library(cmarkhtml SHARED md2html.c)
target_compile_definitions(cmarkhtml PRIVATE
  CMARK_GFM_STATIC_DEFINE
  CMARK_GFM_EXTENSIONS_STATIC_DEFINE
)
target_include_directories(cmarkhtml PRIVATE
  "${CMARK_GFM_SOURCE_DIR}/src"
  "${CMARK_GFM_SOURCE_DIR}/extensions"
  "${CMAKE_CURRENT_BINARY_DIR}/cmark-gfm/src"
  "${CMAKE_CURRENT_BINARY_DIR}/cmark-gfm/extensions"
)
target_link_libraries(cmarkhtml PRIVATE ${UNI_CMARK_HTML_LIBRARIES})
if(ANDROID)
  target_link_options(cmarkhtml PRIVATE "-Wl,--exclude-libs,ALL")
endif()

if(NOT ANDROID)
  enable_testing()
  add_executable(md2html_test tests/md2html_test.c md2html.c)
  target_compile_definitions(md2html_test PRIVATE
    UNI_CMARK_NO_JNI
    CMARK_GFM_STATIC_DEFINE
    CMARK_GFM_EXTENSIONS_STATIC_DEFINE
  )
  target_include_directories(md2html_test PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}"
    "${CMARK_GFM_SOURCE_DIR}/src"
    "${CMARK_GFM_SOURCE_DIR}/extensions"
    "${CMAKE_CURRENT_BINARY_DIR}/cmark-gfm/src"
    "${CMAKE_CURRENT_BINARY_DIR}/cmark-gfm/extensions"
  )
  target_link_libraries(md2html_test PRIVATE ${UNI_CMARK_HTML_LIBRARIES})
  add_test(NAME md2html_test COMMAND md2html_test)
endif()
