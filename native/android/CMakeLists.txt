cmake_minimum_required(VERSION 3.16)
project(libmark_bridge_android CXX)

get_filename_component(LIBMARK_DEMO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)

add_library(libmark_bridge SHARED libmark_bridge_jni.cpp)
set_target_properties(libmark_bridge PROPERTIES PREFIX "" OUTPUT_NAME "libmark_bridge")
set_target_properties(libmark_bridge PROPERTIES
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/libs/${ANDROID_ABI}"
  SKIP_BUILD_RPATH TRUE
  BUILD_RPATH ""
  INSTALL_RPATH "")

add_library(libmark-full SHARED IMPORTED)
set_target_properties(libmark-full PROPERTIES
  IMPORTED_LOCATION "${LIBMARK_DEMO_ROOT}/native/prebuilt/android-arm64-v8a/libmark-full.so"
  INTERFACE_INCLUDE_DIRECTORIES "${LIBMARK_DEMO_ROOT}/native/include")

target_include_directories(libmark_bridge PRIVATE "${LIBMARK_DEMO_ROOT}/native/include")
target_link_libraries(libmark_bridge PUBLIC libmark-full)
target_compile_features(libmark_bridge PRIVATE cxx_std_17)

# release 配置去掉调试段和符号表；与 HarmonyOS 桥保持一致，交付的就是 strip 后的字节。
if(CMAKE_BUILD_TYPE STREQUAL "Release" AND CMAKE_STRIP)
  add_custom_command(TARGET libmark_bridge POST_BUILD
    COMMAND "${CMAKE_STRIP}" --strip-all $<TARGET_FILE:libmark_bridge>
    COMMENT "Stripping libmark_bridge")
endif()
